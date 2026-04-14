export interface NodeRecord {
  id: string;
  name: string;
  kind: "local" | "remote";
}
