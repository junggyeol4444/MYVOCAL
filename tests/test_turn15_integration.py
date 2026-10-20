import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from turn15_existing_main_integration import integrate

class TestExistingMainIntegration(unittest.TestCase):
 def test_additive_idempotent_and_existing_files_preserved(self):
  source=Path(__file__).resolve().parents[1]
  with tempfile.TemporaryDirectory() as root:
   dest=Path(root)
   main=dest/'desktop/main.go';main.parent.mkdir(parents=True)
   main.write_text('package main\nfunc routes(){\n mux.HandleFunc("/api/singing/rvc/convert", a.rvcConvert)\n}\n')
   ws=dest/'MYVOCAL-Studio-source/src/pages/Workspace.jsx';ws.parent.mkdir(parents=True)
   ws.write_text("import SingingWorkbench from '../components/SingingWorkbench';\n{tab==='singing'&&<SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/>}")
   existing=dest/'MYVOCAL-Studio-source/important_user_data.json';existing.write_bytes(b'unchanged')
   a=integrate(source,dest)
   self.assertTrue(a['mainChanged']);self.assertTrue(a['workspaceChanged'])
   self.assertIn('score-vocal',main.read_text());self.assertIn('lipsync2d',main.read_text())
   self.assertIn('Viseme2DPanel',ws.read_text());self.assertIn('ScoreVocalPanel',ws.read_text())
   self.assertEqual(existing.read_bytes(),b'unchanged')
   self.assertEqual(integrate(source,dest)['newFiles'],0)
 def test_conflict_preflight_no_mutation(self):
  source=Path(__file__).resolve().parents[1]
  with tempfile.TemporaryDirectory() as root:
   dest=Path(root)
   main=dest/'desktop/main.go';main.parent.mkdir(parents=True)
   main.write_text('mux.HandleFunc("/api/singing/rvc/convert", a.rvcConvert)')
   ws=dest/'MYVOCAL-Studio-source/src/pages/Workspace.jsx';ws.parent.mkdir(parents=True)
   ws.write_text("import SingingWorkbench from '../components/SingingWorkbench';\n{tab==='singing'&&<SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/>}")
   conflict=dest/'desktop/viseme_2d_worker.py';conflict.write_bytes(b'previous owner data')
   old_main=main.read_bytes();old_ws=ws.read_bytes()
   with self.assertRaises(RuntimeError):integrate(source,dest)
   self.assertEqual(main.read_bytes(),old_main);self.assertEqual(ws.read_bytes(),old_ws)
   self.assertEqual(conflict.read_bytes(),b'previous owner data')

if __name__=='__main__':unittest.main()
