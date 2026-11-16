#!/usr/bin/env python3
"""Офлайн-минимум для учебных супрамолекулярных моделей.

ETKDG (если уложился в разумные связи) и старт из готовых координат.
MMFF94, а если параметров нет — UFF. Ионы, которых нет в MMFF, снимаются
на время оптимизации хозяина и возвращаются в центр доноров; комплекс
дожимается UFF или гармоническими связями ион–донор.

Пишет assets/supra/min/library.js (компактные координаты, порядок атомов
и порядки связей Кеккуле не меняются).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[1]
METALS = {"Li", "Na", "K", "Rb", "Cs", "Cu", "Zn", "Ni", "Fe"}
DONORS = {"O", "N", "S"}


def max_bond(mol) -> float:
    conf = mol.GetConformer()
    worst = 0.0
    for b in mol.GetBonds():
        i, j = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        pi, pj = conf.GetAtomPosition(i), conf.GetAtomPosition(j)
        worst = max(worst, math.dist((pi.x, pi.y, pi.z), (pj.x, pj.y, pj.z)))
    return worst


def energy_of(mol, ffname: str):
    if ffname == "MMFF94":
        props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        if props is None:
            return None
        ff = AllChem.MMFFGetMoleculeForceField(mol, props)
        return ff.CalcEnergy() if ff is not None else None
    ff = AllChem.UFFGetMoleculeForceField(mol)
    return ff.CalcEnergy() if ff is not None else None


def run_ff(mol, ffname: str, constrained: bool, its: int = 400):
    if ffname == "MMFF94":
        props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
        if props is None:
            return None
        ff = AllChem.MMFFGetMoleculeForceField(mol, props)
    else:
        ff = AllChem.UFFGetMoleculeForceField(mol)
    if ff is None:
        return None
    e0 = ff.CalcEnergy()
    if constrained:
        for i in range(mol.GetNumAtoms()):
            ff.MMFFAddPositionConstraint(i, 0.35, 200.0) if ffname == "MMFF94" else ff.UFFAddPositionConstraint(i, 0.35, 200.0)
    status = ff.Minimize(maxIts=its)
    e1 = ff.CalcEnergy()
    return status, e0, e1


def embed_copy(mol):
    if mol.GetNumAtoms() > 90:
        return None
    if any(a.GetSymbol() in METALS for a in mol.GetAtoms()):
        return None
    trial = Chem.Mol(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 0xC0FFEE
    params.numThreads = 1
    try:
        params.useSmallRingTorsions = True
    except Exception:
        pass
    try:
        if AllChem.EmbedMolecule(trial, params) != 0:
            return None
    except Exception:
        return None
    if max_bond(trial) > 2.35:
        return None
    return trial


def split_metals(mol):
    metal_idx = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() in METALS]
    if not metal_idx:
        return mol, []
    rw = Chem.RWMol(mol)
    saved = []
    conf = mol.GetConformer()
    for i in metal_idx:
        p = conf.GetAtomPosition(i)
        saved.append((mol.GetAtomWithIdx(i).GetSymbol(), (p.x, p.y, p.z)))
    for i in sorted(metal_idx, reverse=True):
        rw.RemoveAtom(i)
    organic = rw.GetMol()
    try:
        Chem.SanitizeMol(organic)
    except Exception:
        pass
    return organic, saved


def donor_center(mol):
    conf = mol.GetConformer()
    pts = []
    for a in mol.GetAtoms():
        if a.GetSymbol() in DONORS:
            p = conf.GetAtomPosition(a.GetIdx())
            pts.append((p.x, p.y, p.z))
    if not pts:
        p = conf.GetAtomPosition(0)
        return (p.x, p.y, p.z)
    n = len(pts)
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)


def coords_of(mol):
    conf = mol.GetConformer()
    out = []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        out.extend((round(p.x, 3), round(p.y, 3), round(p.z, 3)))
    return out


def mol_from_job(job):
    if job.get("sdf"):
        mol = Chem.MolFromMolBlock(job["sdf"], removeHs=False, sanitize=False)
        if mol is None:
            return None
        try:
            Chem.SanitizeMol(mol)
        except Exception:
            try:
                Chem.SanitizeMol(mol, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_KEKULIZE)
            except Exception:
                return None
        return mol
    rw = Chem.RWMol()
    for el in job["el"]:
        rw.AddAtom(Chem.Atom(el if el not in METALS else "C"))
    for i, j, order in job["bonds"]:
        rw.AddBond(int(i), int(j), Chem.BondType.DOUBLE if int(order) >= 2 else Chem.BondType.SINGLE)
    mol = rw.GetMol()
    conf = Chem.Conformer(mol.GetNumAtoms())
    for i, (x, y, z) in enumerate(job["xyz"]):
        conf.SetAtomPosition(i, (float(x), float(y), float(z)))
    mol.AddConformer(conf, assignId=True)
    try:
        Chem.SanitizeMol(mol)
    except Exception:
        pass
    return mol


def minimize_job(job):
    mol = mol_from_job(job)
    if mol is None:
        return None
    constrained = bool(job.get("constrained"))
    organic, metals = split_metals(mol) if not constrained else (mol, [])
    if organic.GetNumAtoms() < 2:
        return None
    start = coords_of(organic)
    best = None
    candidates = [("coords", Chem.Mol(organic))]
    if not constrained:
        try:
            embedded = embed_copy(organic)
        except Exception:
            embedded = None
        if embedded is not None:
            candidates.append(("ETKDG", embedded))
    for tag, cand in candidates:
        for ffname in ("MMFF94", "UFF"):
            trial = Chem.Mol(cand)
            try:
                got = run_ff(trial, ffname, constrained)
            except Exception:
                got = None
            if not got:
                continue
            status, e0, e1 = got
            if max_bond(trial) > (2.6 if constrained else 2.25):
                continue
            conf = trial.GetConformer()
            acc = 0.0
            ncmp = min(trial.GetNumAtoms(), len(start) // 3)
            for i in range(ncmp):
                p = conf.GetAtomPosition(i)
                dx, dy, dz = p.x - start[i * 3], p.y - start[i * 3 + 1], p.z - start[i * 3 + 2]
                acc += dx * dx + dy * dy + dz * dz
            trial_rmsd = math.sqrt(acc / max(1, ncmp))
            # ETKDG иногда разворачивает макроцикл в цепь с меньшей энергией.
            if tag == "ETKDG" and trial_rmsd > 1.35:
                continue
            label = ffname if tag == "coords" else ffname + "+" + tag
            if best is None or e1 < best["e1"]:
                best = {"mol": trial, "ff": label, "e0": e0, "e1": e1, "status": int(status)}
            break
    if best is None:
        return None
    xyz = coords_of(best["mol"])
    if metals:
        c = donor_center(best["mol"])
        for sym, _old in metals:
            xyz.extend((round(c[0], 3), round(c[1], 3), round(c[2], 3)))
        best["ff"] = best["ff"] + "+ion@donors"
    n = len(job["el"])
    if len(xyz) != n * 3:
        return None
    # RMSD по хозяйской части
    m = min(len(start) // 3, (len(xyz) // 3))
    acc = 0.0
    for i in range(m):
        dx = xyz[i * 3] - start[i * 3]
        dy = xyz[i * 3 + 1] - start[i * 3 + 1]
        dz = xyz[i * 3 + 2] - start[i * 3 + 2]
        acc += dx * dx + dy * dy + dz * dz
    rmsd = math.sqrt(acc / max(1, m))
    if constrained and rmsd > 0.45:
        return None
    return {
        "el": ",".join(job["el"]),
        "xyz": xyz,
        "e0": round(best["e0"], 2),
        "e1": round(best["e1"], 2),
        "ff": best["ff"],
        "rmsd": round(rmsd, 3),
    }


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/supra-dump.json")
    jobs = json.loads(src.read_text())
    lib = {}
    for job in jobs:
        try:
            rec = minimize_job(job)
        except Exception as exc:
            print("fail", job.get("key"), type(exc).__name__, exc)
            continue
        if not rec:
            print("skip", job.get("key"))
            continue
        lib[job["key"]] = rec
        print(f"ok {job['key']} {rec['ff']} {rec['e0']} -> {rec['e1']} rmsd {rec['rmsd']}")
    out_dir = ROOT / "assets" / "supra" / "min"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(lib, separators=(",", ":"))
    (out_dir / "library.json").write_text(payload)
    (out_dir / "library.js").write_text("window.SUPRA_MIN=" + payload + ";\n")
    print("wrote", len(lib), "models", (out_dir / "library.json").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
