export default function MarketTag({ market }: { market: string }) {
  return <span className={`tag ${market.toLowerCase()}`}>{market || "-"}</span>;
}
