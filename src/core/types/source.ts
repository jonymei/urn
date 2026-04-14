export type SourceType = "agent_session" | "browser_history" | "shell_history";

export interface SourceDefinition {
  id: string;
  type: SourceType;
  app: string;
  title: string;
}
