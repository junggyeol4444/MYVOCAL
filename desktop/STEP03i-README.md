# Step03i — native loader preflight (3단계 부분 구현)

`validateX64LoaderPE` validates an on-disk x64 PE32+ DLL before Windows
`LoadDLL`, rejecting malformed files, x86/ARM DLLs, non-DLL EXEs, and
symlinks. It is deliberately read-only and does not touch user profiles.
The official NuGet SHA-512 verification script remains the source-provenance
mechanism; the PE check is not a signature or malware scan.

`loader_pe_test.go` provides 13 table-driven/negative test paths. The
PowerShell preflight emits a local JSON report but cannot certify runtime,
actual COM callback execution, GUI functionality, or saved media persistence.

Windows GUI and real project/media save→close→reopen QA remain required.
