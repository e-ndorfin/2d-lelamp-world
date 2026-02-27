import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { Id } from '../../convex/_generated/dataModel';
import { useSendInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';

const SPRITES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'] as const;
const SPRITE_SHEET_URL = '/ai-town/assets/32x32folk.png';

// Down-facing frame coordinates for each sprite from spritesheets
const SPRITE_FRAMES: Record<string, { x: number; y: number; w: number; h: number }> = {
  f1: { x: 0, y: 0, w: 32, h: 32 },
  f2: { x: 96, y: 0, w: 32, h: 32 },
  f3: { x: 192, y: 0, w: 32, h: 32 },
  f4: { x: 288, y: 0, w: 32, h: 32 },
  f5: { x: 0, y: 128, w: 32, h: 32 },
  f6: { x: 96, y: 128, w: 32, h: 32 },
  f7: { x: 192, y: 128, w: 32, h: 32 },
  f8: { x: 288, y: 128, w: 32, h: 32 },
};

const STORAGE_KEY = 'claw-town-agent-presets';

interface AgentPreset {
  name: string;
  character: string;
  identity: string;
  plan: string;
}

function loadPresets(): AgentPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: AgentPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function upsertPreset(presets: AgentPreset[], preset: AgentPreset): AgentPreset[] {
  const idx = presets.findIndex((p) => p.name === preset.name);
  if (idx >= 0) {
    const updated = [...presets];
    updated[idx] = preset;
    return updated;
  }
  return [...presets, preset];
}

function SpritePreview({
  sprite,
  selected,
  onClick,
}: {
  sprite: string;
  selected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = SPRITE_FRAMES[sprite];
    if (!frame) return;

    const draw = () => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imageRef.current!, frame.x, frame.y, frame.w, frame.h, 0, 0, 64, 64);
    };

    if (imageRef.current) {
      draw();
      return;
    }

    const img = new Image();
    img.src = SPRITE_SHEET_URL;
    img.onload = () => {
      imageRef.current = img;
      draw();
    };
  }, [sprite]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      onClick={onClick}
      className={`cursor-pointer rounded border-2 ${
        selected ? 'border-brown-300' : 'border-transparent'
      } hover:border-brown-200`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function AddAgentModal({
  isOpen,
  onClose,
  engineId,
}: {
  isOpen: boolean;
  onClose: () => void;
  engineId: Id<'engines'>;
}) {
  const [name, setName] = useState('');
  const [character, setCharacter] = useState('f1');
  const [identity, setIdentity] = useState('');
  const [plan, setPlan] = useState('');
  const [presets, setPresets] = useState<AgentPreset[]>(loadPresets);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createAgent = useSendInput(engineId, 'createCustomAgent');

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !identity.trim() || !plan.trim()) return;
    setCreating(true);
    try {
      await toastOnError(createAgent({ name: name.trim(), character, identity: identity.trim(), plan: plan.trim() }));
      const preset: AgentPreset = { name: name.trim(), character, identity: identity.trim(), plan: plan.trim() };
      const updated = upsertPreset(presets, preset);
      setPresets(updated);
      savePresets(updated);
      onClose();
    } finally {
      setCreating(false);
    }
  }, [name, character, identity, plan, presets, createAgent, onClose]);

  const handleLoadPreset = useCallback(() => {
    const preset = presets.find((p) => p.name === selectedPreset);
    if (!preset) return;
    setName(preset.name);
    setCharacter(preset.character);
    setIdentity(preset.identity);
    setPlan(preset.plan);
  }, [selectedPreset, presets]);

  const handleDeletePreset = useCallback(() => {
    const updated = presets.filter((p) => p.name !== selectedPreset);
    setPresets(updated);
    savePresets(updated);
    setSelectedPreset('');
  }, [selectedPreset, presets]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [presets]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result as string) as AgentPreset[];
          if (!Array.isArray(imported)) return;
          let merged = [...presets];
          for (const preset of imported) {
            if (preset.name && preset.character && preset.identity && preset.plan) {
              merged = upsertPreset(merged, preset);
            }
          }
          setPresets(merged);
          savePresets(merged);
        } catch {
          // invalid JSON, ignore
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [presets],
  );

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Add Agent"
      className="box font-body bg-brown-800 text-brown-100 p-6 mx-auto mt-[10vh] max-w-lg w-[90vw] outline-none max-h-[80vh] overflow-y-auto"
      overlayClassName="fixed inset-0 bg-black/60 z-50"
    >
      <h2 className="font-display text-xl mb-4">Add Agent</h2>

      {/* Preset controls */}
      <div className="flex gap-2 mb-4 items-end flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-sm mb-1">Presets</label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="w-full bg-brown-900 text-brown-100 border border-brown-700 rounded px-2 py-1 text-sm"
          >
            <option value="">-- Select --</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleLoadPreset}
          disabled={!selectedPreset}
          className="button text-sm disabled:opacity-40"
        >
          <span>Load</span>
        </button>
        <button
          onClick={handleDeletePreset}
          disabled={!selectedPreset}
          className="button text-sm disabled:opacity-40"
        >
          <span>Delete</span>
        </button>
        <button onClick={handleImport} className="button text-sm">
          <span>Import</span>
        </button>
        <button onClick={handleExport} disabled={presets.length === 0} className="button text-sm disabled:opacity-40">
          <span>Export</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Name */}
      <div className="mb-3">
        <label className="block text-sm mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name"
          className="w-full bg-brown-900 text-brown-100 border border-brown-700 rounded px-2 py-1"
        />
      </div>

      {/* Sprite picker */}
      <div className="mb-3">
        <label className="block text-sm mb-1">Sprite</label>
        <div className="flex gap-2 flex-wrap">
          {SPRITES.map((s) => (
            <SpritePreview
              key={s}
              sprite={s}
              selected={character === s}
              onClick={() => setCharacter(s)}
            />
          ))}
        </div>
      </div>

      {/* Identity */}
      <div className="mb-3">
        <label className="block text-sm mb-1">Identity</label>
        <textarea
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          rows={3}
          placeholder="Describe the agent's personality and background..."
          className="w-full bg-brown-900 text-brown-100 border border-brown-700 rounded px-2 py-1 resize-y"
        />
      </div>

      {/* Plan */}
      <div className="mb-4">
        <label className="block text-sm mb-1">Plan</label>
        <textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          rows={2}
          placeholder="What does this agent want to do?"
          className="w-full bg-brown-900 text-brown-100 border border-brown-700 rounded px-2 py-1 resize-y"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="button text-sm">
          <span>Cancel</span>
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim() || !identity.trim() || !plan.trim()}
          className="button text-sm disabled:opacity-40"
        >
          <span>{creating ? 'Creating...' : 'Create'}</span>
        </button>
      </div>
    </Modal>
  );
}
