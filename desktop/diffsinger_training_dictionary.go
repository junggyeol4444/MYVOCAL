package main

// #06/#08: retrieve the exact pronunciation dictionary copied into the
// completed local DiffSinger job. Never accept an arbitrary filesystem path.
// This read-only endpoint lets a registered voice model use its training
// lexicon during subsequent Korean singing inference without uploading it.
import (
 "io"
 "net/http"
 "os"
 "path/filepath"
)

const diffSingerDictionaryLimit = 2 << 20

func (a *appServer) diffSingerTrainingDictionary(w http.ResponseWriter, r *http.Request) {
 if r.Method != http.MethodGet { jsonError(w, 405, "GET만 허용합니다"); return }
 if !a.authorizeSinging(w, r) { return }
 j := &a.diffSingerTraining
 j.mu.Lock()
 id, state, mode, directory := j.id, j.state, j.mode, j.directory
 j.mu.Unlock()
 if id == "" || !regexpDiffSingerJobID.MatchString(id) || r.URL.Query().Get("id") != id ||
    state != "completed" || mode != "official" || directory == "" {
  jsonError(w, 409, "완료된 공식 DiffSinger 학습의 발음 사전이 없습니다")
  return
 }
 path := filepath.Join(directory, "dataset", "dictionary.txt")
 info, err := os.Lstat(path)
 if err != nil || !info.Mode().IsRegular() || info.Size() < 10 || info.Size() > diffSingerDictionaryLimit {
  jsonError(w, 422, "가창 모델의 학습 발음 사전이 없거나 유효하지 않습니다")
  return
 }
 file, err := os.Open(path)
 if err != nil { jsonError(w, 404, "학습 발음 사전을 읽을 수 없습니다"); return }
 defer file.Close()
 w.Header().Set("Content-Type", "text/plain; charset=utf-8")
 w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-DiffSinger-dictionary.txt")
 w.Header().Set("Cache-Control", "no-store")
 w.Header().Set("X-Content-Type-Options", "nosniff")
 _, _ = io.Copy(w, io.LimitReader(file, diffSingerDictionaryLimit))
}
