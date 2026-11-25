// Typed access to the functions exposed by electron/preload.cjs.
import type { CollectedCourseData } from './analysis/types';

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
}

interface AnalyzerBridge {
  profiles: {
    list(): Promise<Result<ProfileSummary[]>>;
    save(profile: ProfileInput): Promise<Result<{ id: string; tokensStored: boolean }>>;
    /** Opens the site's sign-in page and saves a Moodle app token as the core token. */
    signIn(profile: ProfileInput): Promise<Result<{ id: string; tokensStored: boolean }>>;
    remove(id: string): Promise<Result<void>>;
  };
  session: {
    connect(request: { profileId: string } | ProfileInput): Promise<Result<SiteSummary>>;
    disconnect(): Promise<Result<boolean>>;
    courses(): Promise<Result<CourseSummary[]>>;
    read(provider: 'moodlia' | 'core', operation: string, parameters?: Record<string, unknown>): Promise<Result<unknown>>;
  };
  analysis: {
    collect(courseId: number, course?: CourseSummary): Promise<Result<CollectedCourseData>>;
    onProgress(listener: (progress: { courseId: number; message: string; percent: number }) => void): () => void;
  };
}

declare global {
  interface Window {
    analyzer: AnalyzerBridge;
  }
}

export const analyzer = (): AnalyzerBridge => window.analyzer;
