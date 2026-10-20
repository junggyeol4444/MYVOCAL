#!/usr/bin/env python3
"""Safely apply cumulative existing-MYVOCAL main source modifications.

29th-session official RVC + long singing + offline track export, followed by
30th-session native Demucs neural stem separation/import. All target files are
validated before any replacement. This does NOT create/replace an app/project.
"""
import argparse
import difflib
import os
from pathlib import Path
import subprocess
import tempfile

from apply_official_rvc_to_existing_main import plan as rvc_plan
from extend_main_with_demucs import plan as stems_plan

EXPECTED_HEAD='1ff54047751737edaec025295c382c4e4103c9a9'

def plan(root):
    root=Path(root).resolve()
    changes={p.relative_to(root).as_posix():values for p,values in rvc_plan(root).items()}
    for rel,values in stems_plan(root).items():
        if rel in changes:
            raise ValueError('기존 코드 변경 대상 충돌: '+rel)
        changes[rel]=values
    # Six-minute MusicGen code was already committed to GitHub main at
    # 1ff54047751737edaec025295c382c4e4103c9a9; never reapply it.
    # New tests are additive and never replace an existing file.
    test='MYVOCAL-Studio-source/tests/musicgen-six-minute.test.mjs'
    if (root/test).exists():raise ValueError('기존 파일과 충돌: '+test)
    changes[test]=('',(Path(__file__).resolve().parents[1]/test).read_text(encoding='utf-8'))
    return changes

def run():
    parser=argparse.ArgumentParser()
    parser.add_argument('checkout',help='기존 GitHub MYVOCAL main 체크아웃')
    parser.add_argument('--diff',default='')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--expect-head',default=EXPECTED_HEAD)
    args=parser.parse_args()
    root=Path(args.checkout).resolve()
    if args.apply:
        if not (root/'.git').exists():raise ValueError('기존 main Git 체크아웃이 아닙니다')
        def git(*parts):return subprocess.run(['git',*parts],cwd=root,check=True,capture_output=True,text=True).stdout.strip()
        if git('branch','--show-current')!='main':raise ValueError('기존 main 브랜치에서만 적용합니다')
        if git('rev-parse','HEAD')!=args.expect_head:raise ValueError('main HEAD가 변경됐습니다. 최신 소스와 충돌 검토 후 재작성하세요')
        if git('status','--porcelain'):raise ValueError('기존 로컬 변경이 있습니다. 사용자 데이터 보호를 위해 중단합니다')
    changes=plan(root) # Every original file and every patch anchor is checked before a write.
    if args.diff:
        chunks=[]
        for rel,(old,new) in changes.items():
            chunks.extend(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+rel,tofile='b/'+rel))
        Path(args.diff).write_text(''.join(chunks),encoding='utf-8')
    if not args.apply:
        print(f'기존 main 소스 {len(changes)}개 파일 변경 계획 확인. 실제 파일 변경 없음.')
        return
    staged={}
    replaced=[]
    try:
        for rel,(old,new) in changes.items():
            path=root/rel
            if not path.parent.is_dir():raise ValueError('기존 프로젝트 경로 없음: '+rel)
            fd,tmp=tempfile.mkstemp(prefix='.myvocal-verified-code-',dir=path.parent)
            with os.fdopen(fd,'w',encoding='utf-8',newline='') as f:f.write(new)
            staged[path]=tmp
        for rel,(old,new) in changes.items():
            path=root/rel
            if path.exists():
                if path.read_text(encoding='utf-8')!=old:raise ValueError('확인 이후 파일이 변경됐습니다: '+rel)
            elif old:raise ValueError('기존 파일이 사라졌습니다: '+rel)
            os.replace(staged[path],path)
            replaced.append((path,old))
    except Exception:
        for path,old in reversed(replaced):
            if old:path.write_text(old,encoding='utf-8')
            else:path.unlink(missing_ok=True)
        raise
    finally:
        for tmp in staged.values():
            if os.path.exists(tmp):os.unlink(tmp)
    print(f'기존 MYVOCAL main 체크아웃의 코드 {len(changes)}개 파일에 적용했습니다. 원격 GitHub push는 별도입니다.')

if __name__=='__main__':run()
