package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
)

type Note struct {
	Pitch     int     `json:"pitch"`
	StartBeat float64 `json:"startBeat"`
	Length    float64 `json:"length"`
	Velocity  int     `json:"velocity"`
}
type Track struct {
	Name       string `json:"name"`
	Instrument string `json:"instrument,omitempty"`
	MIDI       []Note `json:"midiNotes"`
}

func (d *Document) Tracks() []Track {
	var raws []struct {
		Name       string `json:"name"`
		Instrument string `json:"instrument"`
		MIDI       []Note `json:"midiNotes"`
	}
	_ = d.Decode("tracks", &raws)
	ts := make([]Track, 0, len(raws))
	for _, t := range raws {
		ts = append(ts, Track{Name: t.Name, Instrument: t.Instrument, MIDI: t.MIDI})
	}
	return ts
}

// GenerateEditableScore generates independent editable MIDI tracks, not a rendered
// audio-only recording. It is deterministic and does NOT claim AI composition.
func (d *Document) GenerateEditableScore() error {
	bpm := d.Int("bpm")
	if bpm < 40 || bpm > 240 {
		return errors.New("BPM must be 40..240")
	}
	progression := []int{60, 67, 69, 65, 60, 67, 69, 65}
	tracks := []Track{{Name: "Lead Melody", Instrument: "piano"}, {Name: "Harmony", Instrument: "strings"}, {Name: "Bass", Instrument: "bass"}, {Name: "Drums", Instrument: "drums"}}
	for bar, root := range progression {
		start := float64(bar * 4)
		for step := 0; step < 4; step++ {
			tracks[0].MIDI = append(tracks[0].MIDI, Note{Pitch: []int{root + 12, root + 16, root + 19, root + 16}[step], StartBeat: start + float64(step), Length: 0.87, Velocity: 88})
			tracks[2].MIDI = append(tracks[2].MIDI, Note{Pitch: root - 24, StartBeat: start + float64(step), Length: 0.8, Velocity: 72})
			tracks[3].MIDI = append(tracks[3].MIDI, Note{Pitch: []int{36, 42, 38, 42}[step], StartBeat: start + float64(step), Length: 0.15, Velocity: 80})
		}
		for _, interval := range []int{0, 4, 7} {
			tracks[1].MIDI = append(tracks[1].MIDI, Note{Pitch: root + interval, StartBeat: start, Length: 3.8, Velocity: 62})
		}
	}
	d.Set("tracks", tracks)
	return nil
}
func vlq(n uint32) []byte {
	if n == 0 {
		return []byte{0}
	}
	var b [5]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte(n & 0x7f)
		if i < len(b)-1 {
			b[i] |= 0x80
		}
		n >>= 7
	}
	return b[i:]
}
func WriteMIDI(path string, tracks []Track, bpm int) error {
	b, err := EncodeMIDI(tracks, bpm)
	if err != nil {
		return err
	}
	return AtomicWrite(path, b)
}
func EncodeMIDI(tracks []Track, bpm int) ([]byte, error) {
	if bpm < 40 || bpm > 240 {
		return nil, errors.New("invalid BPM")
	}
	if len(tracks) == 0 {
		return nil, errors.New("no editable tracks to export")
	}
	if len(tracks) > 16 {
		return nil, errors.New("MIDI track limit 16")
	}
	var out bytes.Buffer
	out.WriteString("MThd")
	_ = binary.Write(&out, binary.BigEndian, uint32(6))
	_ = binary.Write(&out, binary.BigEndian, uint16(1))
	_ = binary.Write(&out, binary.BigEndian, uint16(len(tracks)))
	_ = binary.Write(&out, binary.BigEndian, uint16(480))
	type event struct {
		tick     uint32
		data     []byte
		priority int
	}
	for idx, t := range tracks {
		ch := idx % 16
		if ch == 9 {
			ch = 10
		}
		ev := []event{}
		if idx == 0 {
			tempo := 60000000 / bpm
			ev = append(ev, event{0, []byte{0xff, 0x51, 3, byte(tempo >> 16), byte(tempo >> 8), byte(tempo)}, 0})
		}
		name := []byte(t.Name)
		if len(name) > 120 {
			name = name[:120]
		}
		ev = append(ev, event{0, append([]byte{0xff, 0x03}, append(vlq(uint32(len(name))), name...)...), 0})
		for _, n := range t.MIDI {
			if n.Pitch < 0 || n.Pitch > 127 || n.Velocity < 1 || n.Velocity > 127 || n.StartBeat < 0 || n.Length <= 0 || n.StartBeat > 100000 || n.Length > 10000 {
				return nil, errors.New("invalid MIDI note")
			}
			start := uint32(math.Round(n.StartBeat * 480))
			end := uint32(math.Round((n.StartBeat + n.Length) * 480))
			if end <= start {
				end = start + 1
			}
			ev = append(ev, event{start, []byte{byte(0x90 | ch), byte(n.Pitch), byte(n.Velocity)}, 1}, event{end, []byte{byte(0x80 | ch), byte(n.Pitch), 0}, 0})
		}
		sort.SliceStable(ev, func(i, j int) bool {
			if ev[i].tick == ev[j].tick {
				return ev[i].priority < ev[j].priority
			}
			return ev[i].tick < ev[j].tick
		})
		var part bytes.Buffer
		var previous uint32
		for _, e := range ev {
			part.Write(vlq(e.tick - previous))
			part.Write(e.data)
			previous = e.tick
		}
		part.Write([]byte{0, 0xff, 0x2f, 0})
		out.WriteString("MTrk")
		_ = binary.Write(&out, binary.BigEndian, uint32(part.Len()))
		out.Write(part.Bytes())
	}
	return out.Bytes(), nil
}
func WritePreviewWAV(path string, tracks []Track, bpm int) error {
	b, err := EncodePreviewWAV(tracks, bpm)
	if err != nil {
		return err
	}
	return AtomicWrite(path, b)
}
func EncodePreviewWAV(tracks []Track, bpm int) ([]byte, error) {
	if bpm < 40 || bpm > 240 {
		return nil, errors.New("invalid BPM")
	}
	if len(tracks) == 0 {
		return nil, errors.New("no notes")
	}
	const sr = 22050
	duration := 0.0
	count := 0
	for _, t := range tracks {
		for _, n := range t.MIDI {
			if n.StartBeat < 0 || n.Length <= 0 || n.Length > 10000 || n.Pitch < 0 || n.Pitch > 127 {
				return nil, errors.New("invalid note")
			}
			end := (n.StartBeat + n.Length) * 60 / float64(bpm)
			if end > duration {
				duration = end
			}
			count++
		}
	}
	if count == 0 {
		return nil, errors.New("no notes")
	}
	if duration > 120 {
		return nil, errors.New("preview limited to 2 minutes")
	}
	samples := make([]float64, int(math.Ceil((duration+0.4)*sr)))
	for _, t := range tracks {
		for _, n := range t.MIDI {
			if n.Pitch == 0 {
				continue
			}
			start := int(n.StartBeat * 60 / float64(bpm) * sr)
			end := int((n.StartBeat + n.Length) * 60 / float64(bpm) * sr)
			freq := 440 * math.Pow(2, float64(n.Pitch-69)/12)
			for i := start; i < end && i < len(samples); i++ {
				dt := float64(i-start) / sr
				env := math.Min(1, dt*35) * math.Min(1, float64(end-i)/(sr*0.07))
				samples[i] += .08 * env * math.Sin(2*math.Pi*freq*dt)
			}
		}
	}
	var b bytes.Buffer
	sz := uint32(len(samples) * 2)
	b.WriteString("RIFF")
	_ = binary.Write(&b, binary.LittleEndian, uint32(36)+sz)
	b.WriteString("WAVEfmt ")
	_ = binary.Write(&b, binary.LittleEndian, uint32(16))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))
	_ = binary.Write(&b, binary.LittleEndian, uint32(sr))
	_ = binary.Write(&b, binary.LittleEndian, uint32(sr*2))
	_ = binary.Write(&b, binary.LittleEndian, uint16(2))
	_ = binary.Write(&b, binary.LittleEndian, uint16(16))
	b.WriteString("data")
	_ = binary.Write(&b, binary.LittleEndian, sz)
	for _, sample := range samples {
		sample = math.Tanh(sample)
		_ = binary.Write(&b, binary.LittleEndian, int16(math.Round(sample*32767)))
	}
	return b.Bytes(), nil
}
func StoryboardSRT(story string) string {
	lines := strings.Split(strings.ReplaceAll(story, "\r\n", "\n"), "\n")
	var b strings.Builder
	idx := 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		start := idx * 8
		end := start + 8
		idx++
		fmt.Fprintf(&b, "%d\n%02d:%02d:%02d,000 --> %02d:%02d:%02d,000\n%s\n\n", idx, start/3600, (start/60)%60, start%60, end/3600, (end/60)%60, end%60, line)
	}
	return b.String()
}
func ExportSRT(path, story string) error {
	if strings.TrimSpace(story) == "" {
		return errors.New("storyboard empty")
	}
	return AtomicWrite(path, []byte(StoryboardSRT(story)))
}
func ExportLyrics(path, lyrics string) error {
	if strings.TrimSpace(lyrics) == "" {
		return errors.New("lyrics empty")
	}
	return os.WriteFile(path, []byte(lyrics), 0600)
}
