export interface AppState {
  preset: {
    activePresetName: string | undefined;
  };
}

export function createAppState(): AppState {
  return {
    preset: {
      activePresetName: undefined,
    },
  };
}
