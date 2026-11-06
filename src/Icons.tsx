type IconName = "folder" | "file" | "back" | "forward" | "up" | "home" | "refresh" | "left" | "right" | "link" | "activity";
const paths: Record<IconName, string> = {
  folder: "M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
  file: "M6 3h8l4 4v14H6V3Zm8 0v5h4",
  back: "m14 6-6 6 6 6", forward: "m10 6 6 6-6 6", up: "M12 19V5m-6 6 6-6 6 6",
  home: "m3 11 9-8 9 8m-16-1v10h5v-6h4v6h5V10",
  refresh: "M20 10a8 8 0 1 0-1 7m1-13v6h-6",
  left: "M3 4h18v16H3zM11 4v16M6 8h2m-2 4h2",
  right: "M3 4h18v16H3zM13 4v16m3-12h2m-2 4h2",
  link: "m9 15 6-6m-5 0 3-3a4 4 0 0 1 6 6l-3 3m-2 0-3 3a4 4 0 0 1-6-6l3-3",
  activity: "M3 6h18M3 12h13M3 18h8",
};
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
