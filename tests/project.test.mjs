import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { projectFile, validateProject, assets, createProject, makeClip, makeTrack } from './.compiled/project-entry.mjs';

test('bundled project preserves asset bytes, fonts, words and keyframes', async () => {
  const p = createProject('Round trip');
  const track = makeTrack('lyrics', 'Lyrics');
  const line = makeClip('lyrics', track.id, 125, 3250, 'Every word remains editable');
  line.words[0].start = 155;
  line.keyframes = [{ id: 'key', time: 2200, property: 'opacity', value: 0.6, easing: 'linear' }];
  p.tracks = [track]; p.clips = [line];
  p.lyricStyle.font = 'Project Serif';
  p.assets = [{ id: 'font', name: 'Font.ttf', type: 'font', mime: 'font/ttf', size: 4, fontFamily: 'Project Serif' }];
  assets.blobs.set('font', new Blob([new Uint8Array([0, 1, 2, 255])]));
  try {
    const archive = unzipSync(new Uint8Array(await (await projectFile(p)).arrayBuffer()));
    assert.deepEqual([...archive['assets/font']], [0, 1, 2, 255]);
    const restored = validateProject(JSON.parse(strFromU8(archive['project.json'])));
    assert.deepEqual(restored.clips, p.clips);
    assert.equal(restored.lyricStyle.font, 'Project Serif');
    assert.deepEqual(restored.assets, p.assets);
  } finally { assets.blobs.delete('font'); }
});

test('project bundling rejects a missing asset instead of silently losing it', async () => {
  const p = createProject('Missing media');
  p.assets = [{ id: 'missing', name: 'Song.wav', type: 'audio', mime: 'audio/wav', size: 4 }];
  await assert.rejects(projectFile(p), /Cannot bundle missing media: Song.wav/);
});

test('project validation rejects broken references and duplicate clip IDs', () => {
  const p = createProject('Invalid');
  const track = makeTrack('lyrics', 'Lyrics');
  const line = makeClip('lyrics', track.id, 0, 1000, 'A line');
  p.tracks = [track]; p.clips = [line, line];
  assert.throws(() => validateProject(p), /Duplicate clip IDs/);
  p.clips = [{ ...line, trackId: 'unknown' }];
  assert.throws(() => validateProject(p), /missing track/);
});
