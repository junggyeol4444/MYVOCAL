package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Document preserves unrecognized metadata, MIDI arrangements, licensed training
// references and media links from the existing MYVOCAL_PROJECT_BACKUP format.
// Never deserialize into a narrow struct and overwrite historical projects.
type Document struct {
	Root    map[string]json.RawMessage
	Project map[string]json.RawMessage
	Path    string
}

func NewDocument() *Document {
	d := &Document{Root: map[string]json.RawMessage{}, Project: map[string]json.RawMessage{}}
	d.setRoot("format", "MYVOCAL_PROJECT_BACKUP")
	d.setRoot("formatVersion", 2)
	d.setRoot("exportedAt", time.Now().UTC().Format(time.RFC3339Nano))
	d.Set("id", fmt.Sprintf("native_%d", time.Now().UnixNano()))
	d.Set("title", "새 음악 프로젝트")
	d.Set("prompt", "")
	d.Set("lyrics", "")
	d.Set("bpm", 120)
	d.Set("key", "C Major")
	d.Set("status", "초안")
	d.Set("genreMix", []map[string]any{{"name": "Ballad", "weight": 50}, {"name": "Rock", "weight": 30}, {"name": "Orchestral", "weight": 20}})
	d.Set("tracks", []any{})
	d.Set("storyboard", []any{})
	d.Set("voiceId", "")
	d.Set("characterId", "")
	return d
}
func (d *Document) setRoot(k string, v any) { b, _ := json.Marshal(v); d.Root[k] = b }
func (d *Document) Set(k string, v any)     { b, _ := json.Marshal(v); d.Project[k] = b }
func (d *Document) String(k string) string {
	var s string
	_ = json.Unmarshal(d.Project[k], &s)
	return s
}
func (d *Document) Int(k string) int             { var n int; _ = json.Unmarshal(d.Project[k], &n); return n }
func (d *Document) Decode(k string, v any) error { return json.Unmarshal(d.Project[k], v) }
func (d *Document) Marshal() ([]byte, error) {
	if d == nil || d.Project == nil {
		return nil, errors.New("missing project")
	}
	root := make(map[string]json.RawMessage, len(d.Root)+1)
	for k, v := range d.Root {
		root[k] = v
	}
	project, err := json.MarshalIndent(d.Project, "", "  ")
	if err != nil {
		return nil, err
	}
	root["project"] = project
	return json.MarshalIndent(root, "", "  ")
}
func ParseDocument(b []byte) (*Document, error) {
	if len(b) > 128*1024*1024 {
		return nil, errors.New("project JSON too large")
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(b, &root); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if root == nil {
		return nil, errors.New("JSON object required")
	}
	var format string
	_ = json.Unmarshal(root["format"], &format)
	if format != "MYVOCAL_PROJECT_BACKUP" {
		return nil, errors.New("unsupported backup format; original file unchanged")
	}
	var project map[string]json.RawMessage
	if err := json.Unmarshal(root["project"], &project); err != nil || project == nil {
		return nil, errors.New("missing project object")
	}
	return &Document{Root: root, Project: project}, nil
}
func ReadDocument(path string) (*Document, error) {
	f, e := os.Open(path)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil {
		return nil, e
	}
	if st.Size() > 128*1024*1024 {
		return nil, errors.New("project too large")
	}
	buf, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	d, e := ParseDocument(buf)
	if e != nil {
		return nil, e
	}
	d.Path = path
	return d, nil
}
func AtomicWrite(path string, data []byte) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("empty destination")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(dir, ".myvocal-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err = temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	if _, err = temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err = temp.Close(); err != nil {
		return err
	}
	// Preserve a preexisting valid file if the replacement fails.
	if _, err = os.Stat(path); err == nil {
		old, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err = writeBackup(path+".bak", old); err != nil {
			return err
		}
	}
	return os.Rename(temp.Name(), path)
}
func writeBackup(path string, b []byte) error {
	t, err := os.CreateTemp(filepath.Dir(path), ".backup-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(t.Name())
	if _, err = t.Write(b); err != nil {
		t.Close()
		return err
	}
	if err = t.Close(); err != nil {
		return err
	}
	return os.Rename(t.Name(), path)
}
func (d *Document) Save(path string) error {
	data, err := d.Marshal()
	if err != nil {
		return err
	}
	if err = AtomicWrite(path, data); err != nil {
		return err
	}
	d.Path = path
	return nil
}
