import trophySprite from '../assets/ranking/trophies.webp';

export function RankTrophy({ rank }: { rank: number | null }) {
  return rank !== null && rank >= 1 && rank <= 3 ? <span className={`rank-trophy trophy-${rank}`} style={{ backgroundImage: `url("${trophySprite}")` }} aria-hidden="true"/> : null;
}
