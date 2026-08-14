export interface AdapterStatus {
  readonly adapter: string
  readonly version?: string
  readonly data: Readonly<Record<string, unknown>>
}
