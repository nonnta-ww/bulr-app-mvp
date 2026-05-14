export type SystemType =
  | 'btoc'
  | 'btob_saas'
  | 'business'
  | 'payment'
  | 'embedded'
  | 'data_platform';

export interface InterviewerProfile {
  displayName: string;
  roleInOrg?: string;
  yearsOfExperience?: number;
}

export interface CandidateInfo {
  name: string;
  appliedRole: string;
  backgroundSummary: string;
  email?: string;
}
