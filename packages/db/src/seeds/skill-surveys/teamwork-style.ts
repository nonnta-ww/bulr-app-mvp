/**
 * チームワーク・スタイル診断 シードデータ
 *
 * spec: .kiro/specs/teamwork-style-diagnosis（task 3.1・content-canon.md）
 *
 * 目的: 対人・協働の型を測るアンケート。レイヤー1（4軸・二者択一）＋レイヤー2（成長ディメンション・SJT）。
 *
 *  レイヤー1（タイプ判定・必須）: 各軸3問（奇数）の single_choice 二者択一。
 *    - 率直さ candor（直言 ⇔ 調停） / 判断の重心 decisionFocus（課題 ⇔ 関係）
 *    - 距離感 distance（ドライ ⇔ ウェット） / 異論への構え dissent（統一 ⇔ 多様）
 *    - choice.level = 第1極:0 / 第2極:1。両選択肢とも「好ましく聞こえる」表現にし、盛りを抑える（R4.6）。
 *      app-local `answers.ts` が `pickedHighPole = (level === 1)` として解決する。
 *
 *  レイヤー2（成長ディメンション・任意）: 各ディメンション2問の SJT（single_choice・3択）。
 *    - 自己認識 selfAwareness / 他者視点の取得 perspectiveTaking / 感情の自己制御 selfRegulation
 *    - choice.level = 発達段階 0..2（app-local `growth.ts` が段階→非評価アドバイスへ写像）。
 *
 * isRequired: L1=true（提出時に全問回答をサーバ検証で強制→確定タイプは full か none）。
 *             L2=false（任意。答えた人にのみ成長アドバイスを上乗せ・R3.5）。
 *
 * カテゴリ名は app-local `answers.ts` の TEAMWORK_CATEGORY_AXIS / TEAMWORK_CATEGORY_DIMENSION の
 * 安定キーと厳密一致させること（変更不可）。subcategory は非 null 必須。
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';
import type { SkillSurveySeedData } from './runner';

type SeedQuestion = SkillSurveySeedData['categories'][number]['questions'][number];

const SUBCATEGORY = 'チームワーク・スタイル';

/**
 * レイヤー1 二者択一設問（single_choice・必須）。
 * first = 第1極（level 0）、second = 第2極（level 1）。両選択肢とも好ましい表現にする。
 */
function forcedChoiceQuestion(
  body: string,
  displayOrder: number,
  first: string,
  second: string,
): SeedQuestion {
  return {
    text: body,
    questionType: 'single_choice',
    isRequired: true,
    displayOrder,
    choices: [
      { text: first, displayOrder: 0, level: 0 },
      { text: second, displayOrder: 1, level: 1 },
    ],
  };
}

/**
 * レイヤー2 SJT 設問（single_choice・任意）。
 * options は発達段階の低い順（level 0..2）で渡す。
 */
function sjtQuestion(
  body: string,
  displayOrder: number,
  options: [string, string, string],
): SeedQuestion {
  return {
    text: body,
    questionType: 'single_choice',
    isRequired: false,
    displayOrder,
    choices: options.map((text, level) => ({
      text,
      displayOrder: level,
      level,
    })),
  };
}

export const teamworkStyleSurveySeed: SkillSurveySeedData = {
  jobType: 'teamwork_style',
  kind: 'teamwork_style',
  title: 'チームワーク・スタイル診断',
  categories: [
    // ══════════ L1 軸1: 率直さ → candor（直言:0 / 調停:1） ══════════
    {
      name: '率直さ',
      subcategory: SUBCATEGORY,
      displayOrder: 0,
      questions: [
        forcedChoiceQuestion(
          'チームで意見が対立したとき、自分に近いのは？',
          0,
          'その場で思うことをはっきり伝える',
          '場を和らげ、落としどころを探す',
        ),
        forcedChoiceQuestion(
          '相手の進め方に疑問を感じたとき、自分に近いのは？',
          1,
          '率直に「ここは違うと思う」と指摘する',
          '相手の面子も考え、やわらかく問いかける',
        ),
        forcedChoiceQuestion(
          '決めきれない論点が残ったとき、自分に近いのは？',
          2,
          'はっきり是非を言って前へ進めたい',
          '全員が納得できる着地を優先したい',
        ),
      ],
    },

    // ══════════ L1 軸2: 判断の重心 → decisionFocus（課題:0 / 関係:1） ══════════
    {
      name: '判断の重心',
      subcategory: SUBCATEGORY,
      displayOrder: 1,
      questions: [
        forcedChoiceQuestion(
          '何かを決めるとき、より重視するのは？',
          0,
          '何が最も成果につながるか',
          '関わる人が気持ちよく動けるか',
        ),
        forcedChoiceQuestion(
          'メンバーの提案に穴があるとき、まずしたいのは？',
          1,
          '正しさ・精度を突き詰める',
          '本人のやる気や関係を大事にする',
        ),
        forcedChoiceQuestion(
          '難しい仕事を任されたとき、まず考えるのは？',
          2,
          'どうすれば課題を解決できるか',
          '誰とどう協力すれば進むか',
        ),
      ],
    },

    // ══════════ L1 軸3: 距離感 → distance（ドライ:0 / ウェット:1） ══════════
    {
      name: '距離感',
      subcategory: SUBCATEGORY,
      displayOrder: 2,
      questions: [
        forcedChoiceQuestion(
          '職場の人間関係として心地よいのは？',
          0,
          '仕事は仕事と割り切った、さっぱりした関係',
          '私的な面も知り合える、情のある関係',
        ),
        forcedChoiceQuestion(
          'チームで信頼を築くとき、効くと思うのは？',
          1,
          '約束を守り成果を出す積み重ね',
          '雑談や気遣いの積み重ね',
        ),
        forcedChoiceQuestion(
          '同僚が落ち込んでいるとき、自分に近いのは？',
          2,
          '仕事に支障がなければ、そっとしておく',
          '声をかけ、気持ちに寄り添う',
        ),
      ],
    },

    // ══════════ L1 軸4: 異論への構え → dissent（統一:0 / 多様:1） ══════════
    {
      name: '異論への構え',
      subcategory: SUBCATEGORY,
      displayOrder: 3,
      questions: [
        forcedChoiceQuestion(
          'チームの意見がばらけたとき、心地よいのは？',
          0,
          '早く一つの方向に揃えたい',
          'いろんな考えが並ぶ状態も歓迎する',
        ),
        forcedChoiceQuestion(
          'プロジェクトの進め方について、動きやすいのは？',
          1,
          '全員が同じやり方で揃っている',
          '各自のやり方に違いがあってよい',
        ),
        forcedChoiceQuestion(
          '議論の場で、より価値を感じるのは？',
          2,
          'まとまって結論に至る瞬間',
          '多様な視点が出そろう瞬間',
        ),
      ],
    },

    // ══════════ L2 自己認識 → selfAwareness（SJT・任意・level 0..2） ══════════
    {
      name: '自己認識',
      subcategory: SUBCATEGORY,
      displayOrder: 4,
      questions: [
        sjtQuestion(
          '会議で自分の提案が却下され、思わず強い口調で反論してしまった。後から振り返って、自分に近いのは？',
          0,
          [
            '相手の理解不足が原因だと考え、次はもっと丁寧に説明しようと思う',
            '強い口調だったかも、と気づき、次は気をつけようと思う',
            'なぜ強く反応したのかを掘り下げ、相手にも一言フォローを入れる',
          ],
        ),
        sjtQuestion(
          '同僚から「あなたと話すと少し身構えてしまう」と言われた。自分に近いのは？',
          1,
          [
            '相手が繊細なのかと感じ、あまり気にしない',
            'そう見えるのかと驚き、心当たりを探す',
            '自分のどの言動がそうさせるかを尋ね、自分の癖として受け止める',
          ],
        ),
      ],
    },

    // ══════════ L2 他者視点の取得 → perspectiveTaking（SJT・任意・level 0..2） ══════════
    {
      name: '他者視点の取得',
      subcategory: SUBCATEGORY,
      displayOrder: 5,
      questions: [
        sjtQuestion(
          '締切直前、後輩の手が明らかに止まっている。自分に近いのは？',
          0,
          [
            '締切を再確認し、早く進めるよう促す',
            '進捗を聞き、手伝えることがあるか尋ねる',
            '止まった背景を推し量り、本人の状況に合わせて関わる',
          ],
        ),
        sjtQuestion(
          'レビューで相手の成果物に指摘点が多い。自分に近いのは？',
          1,
          [
            '気づいた点を漏れなく全部指摘する',
            '重要な点に絞って伝える',
            '相手の意図や制約を先に確認し、受け取りやすい順序・言い方で伝える',
          ],
        ),
      ],
    },

    // ══════════ L2 感情の自己制御 → selfRegulation（SJT・任意・level 0..2） ══════════
    {
      name: '感情の自己制御',
      subcategory: SUBCATEGORY,
      displayOrder: 6,
      questions: [
        sjtQuestion(
          '会議で自分の担当領域を強く批判され、カッとなる。自分に近いのは？',
          0,
          [
            'その場で感情のまま言い返す',
            '一旦黙り、気持ちが収まってから発言する',
            '一拍おき、批判の妥当な部分を認めつつ建設的に返す',
          ],
        ),
        sjtQuestion(
          '立て込んでいるときに割り込み依頼が来て、イライラする。自分に近いのは？',
          1,
          [
            '態度に出る／後回しだと突き放す',
            '内心の苛立ちを抑えて対応する',
            '自分の状態を自覚し、優先順位と対応可能な時間を落ち着いて伝える',
          ],
        ),
      ],
    },
  ],
};

/**
 * teamwork_style（チームワーク・スタイル）診断アンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runTeamworkStyleSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, teamworkStyleSurveySeed, {
    logLabel: 'teamwork-style',
  });
}
