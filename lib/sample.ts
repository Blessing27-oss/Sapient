import type { Concept, Edge, Question } from "./types.ts";

const names = [
  "Fourier Transform", "Fourier Series", "Orthogonality", "Frequency Domain", "Convolution",
  "Convolution Theorem", "Sampling", "Aliasing", "Windowing", "Parseval's Theorem",
];
const concepts: Concept[] = names.map((name, i) => ({
  id: `c${i + 1}`, name, importance: i < 6 ? 1 : 0.6, verified: false, foundational: i === 0 || i === 2,
}));
const e = (source: string, target: string, weight: number): Edge => ({ source, target, weight, type: "related" });
const edges: Edge[] = [
  e("c1", "c2", 0.3), e("c2", "c3", 0.3), e("c1", "c4", 0.3), e("c4", "c5", 0.2), e("c5", "c6", 0.3),
  e("c1", "c6", 0.2), e("c4", "c7", 0.2), e("c7", "c8", 0.3), e("c7", "c9", 0.2), e("c1", "c10", 0.2), e("c3", "c10", 0.2),
];
const q = (id: string, text: string, options: string[], correctAnswer: number, conceptIds: string[], sourcePage: number, explanation: string): Question =>
  ({ id, text, options, correctAnswer, conceptIds, sourcePage, explanation, approved: true });
const questions: Question[] = [
  q("q1", "What happens to convolution in the time domain when you move to the frequency domain?",
    ["It becomes multiplication", "It becomes differentiation", "It becomes integration", "It becomes subtraction"], 0, ["c1", "c5", "c6"], 4,
    "The convolution theorem: F{f*g} = F{f}·F{g}."),
  q("q2", "Two sinusoids of different integer frequencies over one period have an inner product of…",
    ["Zero", "One", "Their frequency ratio", "Infinity"], 0, ["c3", "c2"], 2, "Distinct harmonics are orthogonal over a period."),
  q("q3", "A Fourier series represents a periodic signal as…",
    ["A sum of harmonically related sinusoids", "A single exponential", "A product of polynomials", "A random process"], 0, ["c2", "c1"], 2, "Sum of harmonics."),
  q("q4", "Sampling a 10 kHz tone at 12 kHz produces…",
    ["Aliasing", "Perfect reconstruction", "A DC offset only", "Zero energy"], 0, ["c7", "c8"], 6, "12 kHz < Nyquist rate of 20 kHz."),
  q("q5", "Parseval's theorem states that…",
    ["Energy is preserved between domains", "Phase is preserved", "Sampling is lossless", "Convolution is commutative"], 0, ["c10", "c1", "c3"], 7, "Energy in time equals energy in frequency."),
  q("q6", "Multiplying a signal by a window function in time corresponds to what in frequency?",
    ["Convolving with the window's spectrum", "Multiplying by the window's spectrum", "Shifting only", "Nothing"], 0, ["c9", "c5", "c4"], 6, "Multiplication ↔ convolution."),
  q("q7", "The frequency domain describes a signal in terms of…",
    ["Its frequency content", "Its arrival time", "Its amplitude histogram", "Its autocorrelation lag"], 0, ["c4"], 3, "Spectrum."),
  q("q8", "Which property makes Fourier-series coefficients computable independently?",
    ["Orthogonality of basis functions", "Linearity of sampling", "Causality", "Stability"], 0, ["c3", "c2"], 2, "Orthogonality lets you project onto each harmonic."),
];

export const SAMPLE = { title: "Fourier Transforms (sample lesson)", concepts, edges, questions };
