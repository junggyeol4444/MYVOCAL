# MYVOCAL Step100 – GitHub source import

This repository contains the **extracted source files** of MYVOCAL Studio Step100, preserving the directory layout of the `source/` folder of the cumulative ZIP at the repository root. Source, assets, tests, config, Go and Python code are normal Git files, not a ZIP.

The 56 historic Windows `.exe` test and release builds in the cumulative ZIP total more than 500 MB. They are preserved **byte-for-byte** in `artifacts/windows-history/step54-87.tar.zst.partNN` and are not required for running the current source tests. The current external Step100 Windows EXE is stored in `artifacts/windows-latest/MYVOCAL-Step100-Windows.exe.zst.partNN`. The included manifest records all SHA-256 values.

To restore all EXEs to their original root-relative paths, run `python tools/restore_archived_windows_exes.py` after installing the local `zstd` executable. The restoration script checks both compressed archive and each restored EXE hash; it never deletes existing files. With no `zstd` command, it explains the requirement rather than corrupting any output.

Run frontend tests from `MYVOCAL-Studio-source/` (`npm test`), desktop tests from `desktop/` (`go test ./...`), and Python tests from `tools/`. All validation changes belong to branch `test/step100-validation`; `main` is a frozen import snapshot after this commit.

**Note:** A GitHub-hosted Windows 2025/2022 runner is not the same as an interactive Windows 11 user device. CI passes must not be reported as successful hands-on Windows 11 GPU testing.
