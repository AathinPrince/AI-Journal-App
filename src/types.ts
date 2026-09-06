export type ReflectionMode = 'reflection' | 'summary' | 'brainstorm' | 'converse' | 'thoughtstream';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface UserInteraction {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  response: string;
  mode: ReflectionMode;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// Perspective Flip Types
export interface DetectedBias {
  biasName: string;
  textEvidence: string;
  potentialImpact: string;
}

export interface PerspectiveFlipResult {
  id?: string;
  interactionId: string;
  userId: string;
  empathicSynthesis: string;
  detectedBiases: DetectedBias[];
  socraticProbes: string[]; // exactly 3 questions
  reframedPerspective: string;
  createdAt: string;
}

// Thought to Task Types
export type TaskUrgency = 'Today' | 'This Week' | 'Backlog';
export type TaskEffort = 'Quick Win (<15m)' | 'Medium Focus (1-2h)' | 'Deep Project (>2h)';
export type TaskCategory = 'Engineering' | 'Personal Health' | 'Operations' | 'Strategy';

export interface ActionItem {
  id: string;
  title: string;
  contextSnippet: string;
  urgency: TaskUrgency;
  estimatedEffort: TaskEffort;
  category: TaskCategory;
  completed: boolean;
}

export interface MicroHabit {
  habit: string;
  cue: string;
}

export interface ActionBoard {
  id: string;
  userId: string;
  interactionId: string;
  entryTitle: string;
  actionItems: ActionItem[];
  suggestedMicroHabit: MicroHabit;
  createdAt: string;
  updatedAt: string;
}
