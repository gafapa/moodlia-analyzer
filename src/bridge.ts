// Typed access to the functions exposed by electron/preload.cjs.
import type { RiskSnapshot } from './analysis/advanced';
import type { CollectedCourseData, RiskLevel } from './analysis/types';

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export interface ProfileSummary {
  id: string;
  name: string;
  url: string;
  hasToken: boolean;
  hasCoreToken: boolean;
}

export interface ProfileInput {
  id?: string;
  name: string;
  url: string;
  token?: string;
  coreToken?: string;
}

export interface ProviderStatus {
  available: boolean;
  reason?: string;
  pluginRelease?: string;
}

export interface SiteSummary {
  siteName: string;
  siteUrl: string;
  moodleRelease: string;
  userId: number;
  moodlia: ProviderStatus;
  core: ProviderStatus;
}

export interface CourseSummary {
  id: number;
  shortName: string;
  fullName: string;
  visible: boolean;
  startDate: number | null;
  endDate: number | null;
  enrolledCount: number | null;
  enableCompletion: boolean;
  lastAccess: number | null;
}

interface AnalyzerBridge {
  profiles: {
    list(): Promise<Result<ProfileSummary[]>>;
    save(profile: ProfileInput): Promise<Result<{ id: string; tokensStored: boolean }>>;
    /** Whether the site gives Moodle app tokens with username and password or through its sign-in page. */
    signInMethod(url: string): Promise<Result<{ method: 'password' | 'browser'; siteName: string }>>;
    /** Gets a Moodle app token (with the password, or the site's sign-in page without it) and saves it as the core token. */
    signIn(profile: ProfileInput & { username?: string; password?: string }): Promise<Result<{ id: string; tokensStored: boolean }>>;
    remove(id: string): Promise<Result<void>>;
  };
  session: {
    connect(request: { profileId: string } | ProfileInput): Promise<Result<SiteSummary>>;
    disconnect(): Promise<Result<boolean>>;
    courses(): Promise<Result<CourseSummary[]>>;
    read(provider: 'moodlia' | 'core', operation: string, parameters?: Record<string, unknown>): Promise<Result<unknown>>;
    /** Opens a page of the connected Moodle site, such as "/mod/assign/view.php?id=5", in the default browser. */
    open(path: string): Promise<Result<boolean>>;
  };
  analysis: {
    collect(courseId: number, course?: Record<string, unknown>): Promise<Result<CollectedCourseData>>;
    /** Saves today's risk levels of the course on this computer; returns all saved days, oldest first. */
    history(courseId: number, risks: Record<number, RiskLevel>): Promise<Result<RiskSnapshot[]>>;
    onProgress(listener: (progress: { courseId: number; message: string; percent: number }) => void): () => void;
  };
}

declare global {
  interface Window {
    analyzer: AnalyzerBridge;
  }
}

export const analyzer = (): AnalyzerBridge => window.analyzer;
