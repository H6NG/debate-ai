import { BUILTIN_PERSONAS } from "./personas";
import type { PersonaTurn } from "@/components/DebateStage";
import type { Challenge } from "./relationship";
import type { DebateReport, Persona } from "./types";

// Fully offline sample debate: no API key, no network. Lets new users
// experience every tab before signing up with a provider.
export interface SampleDebate {
  question: string;
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  challenges: Challenge[];
  totalRounds: number;
  report: DebateReport;
  providerLabel: string;
  modelId: string;
}

function pick(...ids: string[]): Persona[] {
  return ids.map((id) => BUILTIN_PERSONAS.find((p) => p.id === id)!).filter(Boolean);
}

export function getSampleDebate(): SampleDebate {
  const personas = pick("economist", "engineer", "skeptic", "geopolitical-strategist", "trader");
  const turnsByPersona: Record<string, PersonaTurn[]> = {
    economist: [
      {
        round: 1,
        text: "NVIDIA holds roughly 80% of the AI accelerator market with gross margins near 75%, and CUDA keeps switching costs brutal. I put continued dominance through 2030 at 72%.",
      },
      {
        round: 2,
        text: "The Skeptic's custom-silicon point is fair — cloud capex is diversifying — but NVIDIA's networking stack (InfiniBand, NVLink) still has no peer. Trimming to 68%.",
      },
    ],
    engineer: [
      {
        round: 1,
        text: "On pure silicon, the moat is narrower than it looks: TPUs and AMD's MI series run most inference workloads within 20% on perf-per-dollar. I'd say 55% they stay dominant.",
      },
      {
        round: 2,
        text: "The Economist convinced me the software stack matters more than the chips, and ROCm still isn't CUDA. Moving up to 62%.",
      },
    ],
    skeptic: [
      {
        round: 1,
        text: "Every dominant chipmaker eventually gets commoditized — Intel, then mobile SoCs. Hyperscalers designing their own silicon is the same movie. Only 38% they hold through 2030.",
      },
      {
        round: 2,
        text: "Nobody has answered the base-rate question: how often does an 80% share survive five years in semiconductors? Staying at 40%.",
      },
    ],
    "geopolitical-strategist": [
      {
        round: 1,
        text: "Export controls cut both ways: they protect NVIDIA's lead in the West but fund a parallel Chinese supply chain that could contest the global market by decade's end. 58%.",
      },
      {
        round: 2,
        text: "The Trader's pricing argument resonates — markets already discount China risk. Holding at 60%.",
      },
    ],
    trader: [
      {
        round: 1,
        text: "Prediction markets and the options skew imply the street prices continued dominance around 65-70%. The information edge here is supply-chain checks, which still show 12-month backlogs. 66%.",
      },
      {
        round: 2,
        text: "Backlogs are shortening though — lead times fell from 11 months to 4. That plus the Skeptic's capex point takes me to 61%.",
      },
    ],
  };
  return {
    question: "Will NVIDIA maintain its AI GPU market dominance through 2030?",
    personas,
    turnsByPersona,
    challenges: [
      { round: 2, fromId: "skeptic", toId: "economist" },
      { round: 2, fromId: "economist", toId: "engineer" },
    ],
    totalRounds: 2,
    report: {
      summary:
        "The panel converges near 60%: NVIDIA's CUDA moat and networking stack protect its lead, but custom silicon, export controls, and mean reversion in chip-market shares are real threats. The Skeptic's base-rate challenge went largely unanswered and is the main reason the estimate sits below market pricing.",
      pros: [
        "CUDA and the software ecosystem keep switching costs extremely high (Economist, Engineer)",
        "Networking (InfiniBand, NVLink) has no credible peer for large-scale training (Economist)",
        "Supply-chain checks still show multi-month backlogs into next year (Trader)",
      ],
      cons: [
        "Hyperscaler custom silicon (TPU, Trainium, Maia) erodes the merchant market yearly (Skeptic)",
        "An 80% share rarely survives five years in semiconductors on base rates (Skeptic)",
        "Export controls fund a parallel Chinese supply chain (Geopolitical Strategist)",
      ],
      probability: 60,
      confidence: "medium",
      keyUncertainties: [
        "Whether ROCm or open stacks close the CUDA gap by 2028",
        "How fast hyperscaler in-house chips displace merchant GPUs",
        "Whether China restrictions tighten or loosen after 2027",
      ],
      keyClaims: [
        { claim: "NVIDIA holds roughly 80% of the AI accelerator market", source: "unstated" },
        { claim: "GPU lead times fell from 11 months to 4", source: "unstated" },
      ],
    },
    providerLabel: "Sample",
    modelId: "offline demo",
  };
}
