// Green text in the logo's pattern: the S's two greens as even diagonal bands running through the letters.
export default function TwoTone({ children }: { children: string }) {
  return <span className="fold-text">{children}</span>;
}
