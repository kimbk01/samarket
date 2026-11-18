export declare const APP_LAUNCH_LIMIT: number;
export declare function countAppLaunches(text: string): number;
export declare function analyzeCommand(command: string, cwd: string): { launches: number; loop: boolean };
export declare function analyzeBrowserAutomation(command: string, cwd: string): { runs: number; loop: boolean };
export declare function decide(input: Record<string, unknown>, projectDir: string): { deny: string | null };
