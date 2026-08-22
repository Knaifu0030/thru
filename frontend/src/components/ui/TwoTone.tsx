interface Props {
  a: string;
  b: string;
  sub?: string;
}

/** The signature header: neutral white, then the important noun in accent. */
export function TwoTone({ a, b, sub }: Props) {
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-[-0.01em] md:text-xl">
        {a}
        <span className="text-accent">{b}</span>
      </h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}
