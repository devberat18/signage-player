export interface OtaUpdateResult {
  version: string;
  status: "scheduled";
}

export interface OtaUpdatePort {
  applyUpdate(url: string, version: string): Promise<OtaUpdateResult>;
}
