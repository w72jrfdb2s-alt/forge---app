import React, { useState, useEffect, useRef } from 'react';
import { Dumbbell, Flame, MessageCircle, ChevronRight, ChevronLeft, Send, Loader2, RotateCcw, ArrowLeft, KeyRound } from 'lucide-react';
import { storage } from './storage';

const COLORS = {
  bg: '#1C1B19',
  surface: '#242320',
  surfaceLight: '#2E2C28',
  accent: '#FF5A1F',
  accent2: '#FFB454',
  chalk: '#EDE9E1',
  muted: '#8A857A',
  border: '#3A3733',
};

const STORAGE_KEY = 'forge-coach-maxime-profile';
const API_KEY_STORAGE_KEY = 'forge-anthropic-api-key';

type Goal = 'perte_poids' | 'prise_masse' | 'force' | 'maintien' | '';
type Level = 'débutant' | 'intermédiaire' | 'avancé' | '';
type Equipment = 'poids_du_corps' | 'halteres' | 'salle' | '';
type Sex = 'homme' | 'femme' | '';

type Profile = {
  name: string;
  sex: Sex;
  age: string;
  height: string;
  weight: string;
  goal: Goal;
  level: Level;
  equipment: Equipment;
  days: number;
};

type Exercise = { name: string; sets: number; reps: string; principal: boolean };
type Session = { label: string; exercises: Exercise[] };
type Program = { splitName: string; sessions: Session[] };
type Macros = { kcal: number; protein: number; carbs: number; fat: number };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const EXO: Record<string, Record<string, string[]>> = {
  poids_du_corps: {
    push: ['Pompes', 'Pompes surélevées', 'Dips entre deux chaises', 'Pike push-ups'],
    pull: ['Tractions', 'Rowing australien', 'Superman', 'Tirage serviette à la porte'],
    legs: ['Squats', 'Fentes avant', 'Squat bulgare', 'Montées sur banc'],
    core: ['Gainage', 'Relevés de jambes', 'Crunch vélo'],
  },
  halteres: {
    push: ['Développé haltères', 'Élévations latérales', 'Développé militaire haltères', 'Extensions triceps'],
    pull: ['Rowing haltère', 'Curl biceps', 'Soulevé de terre roumain haltères', 'Rowing buste penché'],
    legs: ['Squat gobelet', 'Fentes haltères', 'Soulevé de terre roumain', 'Mollets debout haltères'],
    core: ['Gainage', 'Russian twist', 'Relevés de jambes'],
  },
  salle: {
    push: ['Développé couché barre', 'Développé militaire barre', 'Dips lestés', 'Écarté à la poulie'],
    pull: ['Tractions lestées', 'Rowing barre', 'Tirage vertical', 'Curl barre EZ'],
    legs: ['Squat barre', 'Presse à cuisses', 'Soulevé de terre', 'Leg curl'],
    core: ['Gainage lesté', 'Crunch à la poulie', 'Relevés de jambes suspendu'],
  },
};

const SPLITS: Record<number, string[]> = {
  2: ['full', 'full'],
  3: ['full', 'full', 'full'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['push', 'pull', 'legs', 'upper', 'lower'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

const SESSION_LABELS: Record<string, string> = {
  full: 'Full Body',
  upper: 'Haut du corps',
  lower: 'Bas du corps',
  push: 'Poussée',
  pull: 'Tirage',
  legs: 'Jambes',
};

function pick(arr: string[], n: number, offset: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(arr[(i + offset) % arr.length]);
  return out;
}

function setsRepsFor(goal: Goal, level: Level) {
  if (goal === 'force') return level === 'débutant' ? { sets: 4, reps: '6' } : { sets: 5, reps: '5' };
  if (goal === 'prise_masse') return { sets: 4, reps: '8-10' };
  if (goal === 'perte_poids') return { sets: 3, reps: '12-15' };
  return { sets: 3, reps: '10-12' };
}

function buildSession(type: string, pool: Record<string, string[]>, goal: Goal, level: Level, offset: number): Session {
  const { sets, reps } = setsRepsFor(goal, level);
  let picks: string[] = [];
  if (type === 'full') picks = [...pick(pool.push, 2, offset), ...pick(pool.pull, 2, offset), ...pick(pool.legs, 2, offset)];
  else if (type === 'upper') picks = [...pick(pool.push, 3, offset), ...pick(pool.pull, 3, offset)];
  else if (type === 'lower') picks = [...pick(pool.legs, 4, offset), ...pick(pool.core, 1, offset)];
  else if (type === 'push') picks = [...pick(pool.push, 4, offset), ...pick(pool.core, 1, offset)];
  else if (type === 'pull') picks = [...pick(pool.pull, 4, offset)];
  else if (type === 'legs') picks = [...pick(pool.legs, 4, offset), ...pick(pool.core, 1, offset)];

  return {
    label: SESSION_LABELS[type],
    exercises: picks.map((name, i) => ({ name, sets, reps, principal: i === 0 })),
  };
}

function generateProgram(profile: Profile): Program {
  const pool = EXO[profile.equipment];
  const types = SPLITS[profile.days] || SPLITS[3];
  const sessions = types.map((type, i) => buildSession(type, pool, profile.goal, profile.level, i));
  return { splitName: types.map((t) => SESSION_LABELS[t]).join(' · '), sessions };
}

function computeMacros(profile: Profile): Macros {
  const { sex, age, height, weight, goal, days } = profile;
  const w = Number(weight), h = Number(height), a = Number(age);
  const bmr = sex === 'homme' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const activity = days <= 3 ? 1.4 : days <= 5 ? 1.55 : 1.7;
  let tdee = bmr * activity;
  if (goal === 'perte_poids') tdee *= 0.8;
  if (goal === 'prise_masse') tdee *= 1.12;
  const proteinPerKg = goal === 'perte_poids' ? 2.2 : goal === 'prise_masse' ? 2 : 1.8;
  const protein = Math.round(proteinPerKg * w);
  const proteinKcal = protein * 4;
  const fatKcal = tdee * 0.25;
  const fat = Math.round(fatKcal / 9);
  const carbs = Math.round((tdee - proteinKcal - fatKcal) / 4);
  return { kcal: Math.round(tdee), protein, carbs, fat };
}

function goalLabel(g: Goal) { return { perte_poids: 'perte de poids', prise_masse: 'prise de masse', force: 'force', maintien: 'maintien / forme', '': '' }[g]; }
function equipLabel(e: Equipment) { return { poids_du_corps: 'poids du corps', halteres: 'haltères à la maison', salle: 'salle complète', '': '' }[e]; }

function buildSystemPrompt(profile: Profile, program: Program, macros: Macros) {
  return `Tu es Maxime, coach sportif personnel en musculation. Tu tutoies ${profile.name} et tu le/la connais bien.
Profil : ${profile.sex}, ${profile.age} ans, ${profile.height}cm, ${profile.weight}kg. Objectif : ${goalLabel(profile.goal)}. Niveau : ${profile.level}. Équipement : ${equipLabel(profile.equipment)}. Entraînement ${profile.days}x/semaine (${program.splitName}).
Macros cibles : ${macros.kcal} kcal/jour, ${macros.protein}g protéines, ${macros.carbs}g glucides, ${macros.fat}g lipides.
Réponds en français, ton direct et motivant, 3 à 5 phrases sauf si on te demande plus de détails. Base-toi sur des données scientifiques solides en nutrition sportive et musculation. Rappelle que tu ne remplaces pas un médecin pour toute question de santé.`;
}

async function askCoach(history: ChatMessage[], profile: Profile, program: Program, macros: Macros, apiKey: string) {
  const system = buildSystemPrompt(profile, program, macros);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Erreur ${response.status}`);
  }
  const data = await response.json();
  const text = (data.content || []).map((c: any) => c.text || '').join('\n').trim();
  return text || 'Je réfléchis encore… reformule ta question ?';
}

function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-4 rounded-xl border transition-all duration-150 font-semibold"
      style={{
        backgroundColor: active ? COLORS.accent : COLORS.surface,
        borderColor: active ? COLORS.accent : COLORS.border,
        color: active ? COLORS.bg : COLORS.chalk,
      }}
    >
      {children}
    </button>
  );
}

function NumField({ label, value, onChange, unit, placeholder }: { label: string; value: string; onChange: (v: string) => void; unit: string; placeholder: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: COLORS.muted }}>{label}</label>
      <div className="flex items-center rounded-xl border px-4 py-3" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none text-lg font-semibold"
          style={{ color: COLORS.chalk }}
        />
        <span className="text-sm font-medium" style={{ color: COLORS.muted }}>{unit}</span>
      </div>
    </div>
  );
}

function BarbellMacros({ macros }: { macros: Macros }) {
  const items = [
    { key: 'protein', label: 'Protéines', value: macros.protein, color: COLORS.accent },
    { key: 'carbs', label: 'Glucides', value: macros.carbs, color: COLORS.chalk },
    { key: 'fat', label: 'Lipides', value: macros.fat, color: COLORS.muted },
  ];
  const max = Math.max(...items.map((i) => i.value), 1);
  const sizeFor = (v: number) => 40 + (v / max) * 44;
  const plates = [...items].sort((a, b) => b.value - a.value);

  return (
    <div className="w-full flex flex-col items-center gap-4 py-2">
      <div className="flex items-center justify-center w-full">
        <div className="h-1.5 flex-1 max-w-[20px] rounded-full" style={{ backgroundColor: COLORS.border }} />
        <div className="flex items-center">
          {plates.map((p) => (
            <div
              key={p.key + '-l'}
              className="rounded-full border-2 -ml-1.5"
              style={{ width: sizeFor(p.value), height: sizeFor(p.value), backgroundColor: p.color + '20', borderColor: p.color }}
            />
          ))}
        </div>
        <div className="h-2.5 w-8" style={{ backgroundColor: COLORS.border }} />
        <div className="flex items-center flex-row-reverse">
          {plates.map((p) => (
            <div
              key={p.key + '-r'}
              className="rounded-full border-2 -mr-1.5"
              style={{ width: sizeFor(p.value), height: sizeFor(p.value), backgroundColor: p.color + '20', borderColor: p.color }}
            />
          ))}
        </div>
        <div className="h-1.5 flex-1 max-w-[20px] rounded-full" style={{ backgroundColor: COLORS.border }} />
      </div>
      <div className="flex gap-6">
        {items.map((i) => (
          <div key={i.key} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.muted }}>{i.label}</span>
            <span className="text-base font-bold" style={{ color: i.color }}>{i.value}g</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = ['name', 'sex', 'stats', 'goal', 'level', 'equipment', 'days'] as const;
type Step = typeof STEPS[number];

function canProceed(step: Step, p: Profile) {
  if (step === 'name') return p.name.trim().length > 0;
  if (step === 'sex') return !!p.sex;
  if (step === 'stats') return !!p.age && !!p.height && !!p.weight;
  if (step === 'goal') return !!p.goal;
  if (step === 'level') return !!p.level;
  if (step === 'equipment') return !!p.equipment;
  if (step === 'days') return !!p.days;
  return false;
}

const emptyProfile: Profile = { name: '', sex: '', age: '', height: '', weight: '', goal: '', level: '', equipment: '', days: 3 };

export default function App() {
  const [screen, setScreen] = useState<'loading' | 'onboarding' | 'dashboard' | 'chat'>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [program, setProgram] = useState<Program | null>(null);
  const [macros, setMacros] = useState<Macros | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          setProfile(data.profile);
          setProgram(data.program);
          setMacros(data.macros);
          setMessages(data.messages || []);
          setScreen('dashboard');
          const keyRes = await storage.get(API_KEY_STORAGE_KEY);
          if (keyRes && keyRes.value) setApiKey(keyRes.value);
          return;
        }
      } catch (e) { /* pas de données existantes */ }
      setScreen('onboarding');
    })();
  }, []);

  useEffect(() => {
    if (screen === 'dashboard' || screen === 'chat') {
      storage.set(STORAGE_KEY, JSON.stringify({ profile, program, macros, messages })).catch(() => {});
    }
  }, [profile, program, macros, messages, screen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  function updateProfile(patch: Partial<Profile>) { setProfile((p) => ({ ...p, ...patch })); }

  function finishOnboarding() {
    const prog = generateProgram(profile);
    const mac = computeMacros(profile);
    setProgram(prog);
    setMacros(mac);
    setMessages([{ role: 'assistant', content: `Salut ${profile.name} 💪 Ton programme "${prog.splitName}" est prêt, avec ${mac.kcal} kcal et ${mac.protein}g de protéines par jour. Pose-moi tes questions, je connais ton profil.` }]);
    setScreen('dashboard');
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    await storage.set(API_KEY_STORAGE_KEY, apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setApiKeyInput('');
  }

  async function handleSend() {
    if (!input.trim() || sending || !program || !macros) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSending(true);
    try {
      const reply = await askCoach(newMessages, profile, program, macros, apiKey);
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: "Connexion impossible (vérifie ta clé API ou réessaie dans un instant)." }]);
    } finally {
      setSending(false);
    }
  }

  async function resetAll() {
    if (!window.confirm('Supprimer ton profil et recommencer le questionnaire ?')) return;
    await storage.delete(STORAGE_KEY);
    setProfile(emptyProfile);
    setProgram(null);
    setMacros(null);
    setMessages([]);
    setStepIndex(0);
    setScreen('onboarding');
  }

  const fontStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
    .forge-display { font-family: 'Bebas Neue', 'Inter', sans-serif; letter-spacing: 0.04em; }
    .forge-body { font-family: 'Inter', sans-serif; }
  `;

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center forge-body" style={{ backgroundColor: COLORS.bg }}>
        <style>{fontStyle}</style>
        <Loader2 className="animate-spin" style={{ color: COLORS.accent }} size={32} />
      </div>
    );
  }

  if (screen === 'onboarding') {
    const step = STEPS[stepIndex];
    return (
      <div className="min-h-screen flex flex-col forge-body" style={{ backgroundColor: COLORS.bg }}>
        <style>{fontStyle}</style>
        <div className="px-6 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-6">
            <Dumbbell size={20} style={{ color: COLORS.accent }} />
            <span className="forge-display text-2xl" style={{ color: COLORS.chalk }}>FORGE</span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="h-1 flex-1 rounded-full" style={{ backgroundColor: i <= stepIndex ? COLORS.accent : COLORS.border }} />
            ))}
          </div>
        </div>

        <div className="flex-1 px-6 py-4 flex flex-col justify-center gap-6 max-w-md w-full mx-auto">
          {step === 'name' && (
            <>
              <div>
                <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>C'est quoi ton prénom ?</h1>
                <p className="text-sm" style={{ color: COLORS.muted }}>Ton coach s'en servira à chaque échange.</p>
              </div>
              <input
                autoFocus
                value={profile.name}
                onChange={(e) => updateProfile({ name: e.target.value })}
                placeholder="Ton prénom"
                className="w-full rounded-xl border px-5 py-4 text-lg font-semibold outline-none"
                style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border, color: COLORS.chalk }}
              />
            </>
          )}

          {step === 'sex' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Ton sexe biologique</h1>
              <p className="text-sm mb-2" style={{ color: COLORS.muted }}>Nécessaire pour calculer tes besoins caloriques.</p>
              <div className="flex flex-col gap-3">
                <ChoiceButton active={profile.sex === 'homme'} onClick={() => updateProfile({ sex: 'homme' })}>Homme</ChoiceButton>
                <ChoiceButton active={profile.sex === 'femme'} onClick={() => updateProfile({ sex: 'femme' })}>Femme</ChoiceButton>
              </div>
            </>
          )}

          {step === 'stats' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Tes mensurations</h1>
              <p className="text-sm mb-2" style={{ color: COLORS.muted }}>Pour un calcul précis de tes macros.</p>
              <div className="flex flex-col gap-4">
                <NumField label="Âge" value={profile.age} onChange={(v) => updateProfile({ age: v })} unit="ans" placeholder="25" />
                <NumField label="Taille" value={profile.height} onChange={(v) => updateProfile({ height: v })} unit="cm" placeholder="175" />
                <NumField label="Poids" value={profile.weight} onChange={(v) => updateProfile({ weight: v })} unit="kg" placeholder="70" />
              </div>
            </>
          )}

          {step === 'goal' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Ton objectif principal</h1>
              <div className="flex flex-col gap-3">
                <ChoiceButton active={profile.goal === 'perte_poids'} onClick={() => updateProfile({ goal: 'perte_poids' })}>Perte de poids</ChoiceButton>
                <ChoiceButton active={profile.goal === 'prise_masse'} onClick={() => updateProfile({ goal: 'prise_masse' })}>Prise de masse</ChoiceButton>
                <ChoiceButton active={profile.goal === 'force'} onClick={() => updateProfile({ goal: 'force' })}>Force</ChoiceButton>
                <ChoiceButton active={profile.goal === 'maintien'} onClick={() => updateProfile({ goal: 'maintien' })}>Maintien / forme générale</ChoiceButton>
              </div>
            </>
          )}

          {step === 'level' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Ton niveau</h1>
              <div className="flex flex-col gap-3">
                <ChoiceButton active={profile.level === 'débutant'} onClick={() => updateProfile({ level: 'débutant' })}>Débutant</ChoiceButton>
                <ChoiceButton active={profile.level === 'intermédiaire'} onClick={() => updateProfile({ level: 'intermédiaire' })}>Intermédiaire</ChoiceButton>
                <ChoiceButton active={profile.level === 'avancé'} onClick={() => updateProfile({ level: 'avancé' })}>Avancé</ChoiceButton>
              </div>
            </>
          )}

          {step === 'equipment' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Ton équipement</h1>
              <div className="flex flex-col gap-3">
                <ChoiceButton active={profile.equipment === 'poids_du_corps'} onClick={() => updateProfile({ equipment: 'poids_du_corps' })}>Poids du corps uniquement</ChoiceButton>
                <ChoiceButton active={profile.equipment === 'halteres'} onClick={() => updateProfile({ equipment: 'halteres' })}>Haltères à la maison</ChoiceButton>
                <ChoiceButton active={profile.equipment === 'salle'} onClick={() => updateProfile({ equipment: 'salle' })}>Salle complète</ChoiceButton>
              </div>
            </>
          )}

          {step === 'days' && (
            <>
              <h1 className="forge-display text-3xl mb-1" style={{ color: COLORS.chalk }}>Séances par semaine</h1>
              <div className="grid grid-cols-5 gap-2">
                {[2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    onClick={() => updateProfile({ days: d })}
                    className="aspect-square rounded-xl border font-bold text-lg transition-all"
                    style={{
                      backgroundColor: profile.days === d ? COLORS.accent : COLORS.surface,
                      borderColor: profile.days === d ? COLORS.accent : COLORS.border,
                      color: profile.days === d ? COLORS.bg : COLORS.chalk,
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-6 pb-8 pt-2 flex gap-3 max-w-md w-full mx-auto">
          {stepIndex > 0 && (
            <button
              onClick={() => setStepIndex((i) => i - 1)}
              className="px-5 py-4 rounded-xl border font-semibold flex items-center justify-center"
              style={{ borderColor: COLORS.border, color: COLORS.chalk }}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            disabled={!canProceed(step, profile)}
            onClick={() => (stepIndex === STEPS.length - 1 ? finishOnboarding() : setStepIndex((i) => i + 1))}
            className="flex-1 py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {stepIndex === STEPS.length - 1 ? 'Créer mon programme' : 'Continuer'}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'chat') {
    return (
      <div className="min-h-screen flex flex-col forge-body" style={{ backgroundColor: COLORS.bg }}>
        <style>{fontStyle}</style>
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: COLORS.border }}>
          <button onClick={() => setScreen('dashboard')} style={{ color: COLORS.chalk }}>
            <ArrowLeft size={22} />
          </button>
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}>M</div>
          <div>
            <div className="font-semibold" style={{ color: COLORS.chalk }}>Coach Maxime</div>
            <div className="text-xs" style={{ color: COLORS.muted }}>Ton coach IA</div>
          </div>
        </div>

        {!apiKey && (
          <div className="mx-5 mt-4 p-4 rounded-xl border flex flex-col gap-3" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
            <div className="flex items-center gap-2">
              <KeyRound size={16} style={{ color: COLORS.accent }} />
              <span className="text-sm font-semibold" style={{ color: COLORS.chalk }}>Clé API Anthropic requise</span>
            </div>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Colle ta clé (console.anthropic.com) pour activer Coach Maxime. Elle reste stockée uniquement dans ton navigateur.
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: COLORS.bg, borderColor: COLORS.border, color: COLORS.chalk }}
            />
            <button
              onClick={saveApiKey}
              className="py-2 rounded-lg font-semibold text-sm"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              Enregistrer la clé
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: m.role === 'user' ? COLORS.accent : COLORS.surface,
                color: m.role === 'user' ? COLORS.bg : COLORS.chalk,
                borderTopRightRadius: m.role === 'user' ? 4 : 16,
                borderTopLeftRadius: m.role === 'user' ? 16 : 4,
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="self-start px-4 py-3 rounded-2xl flex items-center gap-2" style={{ backgroundColor: COLORS.surface }}>
              <Loader2 size={16} className="animate-spin" style={{ color: COLORS.muted }} />
              <span className="text-xs" style={{ color: COLORS.muted }}>Maxime réfléchit…</span>
            </div>
          )}
        </div>

        <div className="px-4 py-4 border-t flex items-center gap-2" style={{ borderColor: COLORS.border }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={apiKey ? 'Pose une question…' : 'Ajoute ta clé API ci-dessus'}
            disabled={sending || !apiKey}
            className="flex-1 rounded-full border px-5 py-3 text-sm outline-none disabled:opacity-50"
            style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border, color: COLORS.chalk }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || !apiKey}
            className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (!program || !macros) return null;

  return (
    <div className="min-h-screen forge-body pb-10" style={{ backgroundColor: COLORS.bg }}>
      <style>{fontStyle}</style>
      <div className="flex items-center justify-between px-6 pt-8 pb-4">
        <div className="flex items-center gap-2">
          <Dumbbell size={20} style={{ color: COLORS.accent }} />
          <span className="forge-display text-2xl" style={{ color: COLORS.chalk }}>FORGE</span>
        </div>
        <button onClick={resetAll} style={{ color: COLORS.muted }}>
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="px-6">
        <h1 className="forge-display text-3xl" style={{ color: COLORS.chalk }}>Salut {profile.name}</h1>
        <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
          {goalLabel(profile.goal)} · {profile.days}x/semaine · {equipLabel(profile.equipment)}
        </p>

        <div className="rounded-2xl border p-5 mb-6" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} style={{ color: COLORS.accent }} />
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: COLORS.muted }}>Objectif calorique</span>
          </div>
          <div className="forge-display text-4xl mb-3" style={{ color: COLORS.chalk }}>{macros.kcal} <span className="text-lg" style={{ color: COLORS.muted }}>kcal/jour</span></div>
          <BarbellMacros macros={macros} />
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="forge-display text-xl" style={{ color: COLORS.chalk }}>Ton programme</h2>
          <span className="text-xs" style={{ color: COLORS.muted }}>{program.splitName}</span>
        </div>

        <div className="flex flex-col gap-3 mb-8">
          {program.sessions.map((s, i) => (
            <div key={i} className="rounded-2xl border p-5" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="forge-display text-lg" style={{ color: COLORS.accent }}>0{i + 1}</span>
                <span className="font-semibold" style={{ color: COLORS.chalk }}>{s.label}</span>
              </div>
              <div className="flex flex-col gap-2">
                {s.exercises.map((ex, j) => (
                  <div key={j} className="flex items-center justify-between py-2 border-t" style={{ borderColor: COLORS.border }}>
                    <span className="text-sm" style={{ color: ex.principal ? COLORS.chalk : COLORS.muted, fontWeight: ex.principal ? 700 : 500 }}>{ex.name}</span>
                    <span className="text-sm font-mono" style={{ color: COLORS.accent2 }}>{ex.sets}×{ex.reps}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setScreen('chat')}
          className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2"
          style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
        >
          <MessageCircle size={18} />
          Parler à Coach Maxime
        </button>
      </div>
    </div>
  );
}
