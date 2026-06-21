'use client';

/**
 * CreateOpeningForm — 募集新規作成フォーム
 *
 * 実体は共通の OpeningForm（mode="create"）。既存の import 互換のため薄いラッパーを残す。
 *
 * Requirements: company-and-opening 5.x, 7.4, 8.4
 */

import { OpeningForm } from './opening-form';

export function CreateOpeningForm() {
  return <OpeningForm mode="create" />;
}
