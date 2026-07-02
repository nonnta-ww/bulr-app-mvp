/**
 * インフラ・SRE エンジニア スキルアンケート シードデータ
 *
 * spec: .kiro/specs/infrastructure-sre-survey（設計駆動・正本 CSV なし）
 *
 * 構成: 共通インフラ層 6 + SRE・信頼性層 6 = 計 12 トップカテゴリ。
 * 変換規約（frontend 踏襲）:
 *  - 経験選択系は multi_choice（scoringKind 無し）
 *  - ツール選択系 5 カテゴリ（クラウド / コンテナ・オーケストレーション / IaC / CI・CD / 可観測性）に
 *    代表習熟度ペア（最も得意な X を1つ選ぶ single_choice ＋ 習熟度 proficiency single_choice level 0-3）を付与
 *  - 各トップカテゴリ先頭の経験設問へ isRequired=true（計 12 問）
 *  - score_kind enum は既存値（proficiency のみ使用）
 */

import type { DB } from '../../client';
import { runSkillSurveySeed } from './runner';

export type InfrastructureSreSurveySeedData = {
  jobType: 'infrastructure-sre';
  title: string;
  categories: Array<{
    name: string;
    subcategory: string | null;
    displayOrder: number;
    questions: Array<{
      text: string;
      questionType: 'single_choice' | 'multi_choice' | 'free_text';
      displayOrder: number;
      isRequired?: boolean;
      scoringKind?: 'proficiency' | 'recency';
      choices: Array<{ text: string; displayOrder: number; level?: number }>;
    }>;
  }>;
};

/** 標準習熟度 4 段階（level 0-3）。proficiency 設問で再利用する。 */
const PROFICIENCY_CHOICES = [
  { text: '未経験・知識なし', displayOrder: 0, level: 0 },
  { text: '学習・理解はある（実務経験なし）', displayOrder: 1, level: 1 },
  { text: '実務で実装・運用したことがある', displayOrder: 2, level: 2 },
  { text: '設計・改善を主導／チームへ展開・標準化した', displayOrder: 3, level: 3 },
];

/** multi_choice 選択肢を簡潔に組み立てるヘルパ（displayOrder を自動付与） */
function choices(labels: string[]): Array<{ text: string; displayOrder: number }> {
  return labels.map((text, i) => ({ text, displayOrder: i }));
}

export const infrastructureSreSurveySeed: InfrastructureSreSurveySeedData = {
  jobType: 'infrastructure-sre',
  title: 'インフラ・SREエンジニア スキルアンケート',
  categories: [
    // ══════════ 共通インフラ層 ══════════
    // ── クラウド・プラットフォーム ──
    {
      name: 'クラウド・プラットフォーム',
      subcategory: '主要クラウド',
      displayOrder: 0,
      questions: [
        {
          text: '経験のあるクラウドプラットフォームを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'AWS',
            'Google Cloud',
            'Microsoft Azure',
            'Oracle Cloud (OCI)',
            'IBM Cloud',
            'さくらのクラウド',
            'オンプレミス・プライベートクラウド',
          ]),
        },
        {
          text: '利用経験のあるクラウドサービス領域を選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'コンピュート（EC2/GCE/VM など）',
            'マネージドコンテナ（ECS/EKS/GKE/AKS）',
            'サーバーレス（Lambda/Cloud Functions/Cloud Run）',
            'マネージドDB（RDS/Cloud SQL など）',
            'オブジェクトストレージ（S3/GCS など）',
            'マネージドキャッシュ（ElastiCache/Memorystore）',
            'メッセージング（SQS/SNS/Pub/Sub）',
            'マネージドKubernetes（EKS/GKE/AKS）',
          ]),
        },
      ],
    },
    {
      name: 'クラウド・プラットフォーム',
      subcategory: 'マルチアカウント・組織管理',
      displayOrder: 1,
      questions: [
        {
          text: 'クラウドのアカウント・組織管理で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'マルチアカウント設計（AWS Organizations など）',
            'IAM・権限設計',
            'コスト配分タグ・請求管理',
            'ランディングゾーン構築',
            'SCP・ガードレールによる統制',
          ]),
        },
      ],
    },
    {
      name: 'クラウド・プラットフォーム',
      subcategory: '代表習熟度',
      displayOrder: 2,
      questions: [
        {
          text: '最も得意なクラウドを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'AWS',
            'Google Cloud',
            'Microsoft Azure',
            'Oracle Cloud (OCI)',
            'その他',
          ]),
        },
        {
          text: '選んだクラウドの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── コンテナ・オーケストレーション ──
    {
      name: 'コンテナ・オーケストレーション',
      subcategory: 'コンテナ',
      displayOrder: 3,
      questions: [
        {
          text: 'コンテナ技術で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'Docker',
            'Podman',
            'containerd',
            'マルチステージビルドなどのイメージ最適化',
            'プライベートレジストリ運用',
            'コンテナのセキュリティ対応（非root実行・最小イメージ）',
          ]),
        },
      ],
    },
    {
      name: 'コンテナ・オーケストレーション',
      subcategory: 'Kubernetes',
      displayOrder: 4,
      questions: [
        {
          text: 'Kubernetes に関して経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'Deployment/Service/Ingress の構築',
            'ConfigMap/Secret 管理',
            'StatefulSet・永続ボリューム',
            'HPA/VPA によるオートスケール',
            'RBAC による権限管理',
            'NetworkPolicy によるトラフィック制御',
            'Operator/CRD による拡張',
            'クラスタの構築・アップグレード運用',
          ]),
        },
        {
          text: 'Kubernetes エコシステムで利用経験のあるツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'Helm',
            'Kustomize',
            'Argo CD',
            'Flux',
            'Istio',
            'Linkerd',
            'cert-manager',
            'External Secrets Operator',
          ]),
        },
      ],
    },
    {
      name: 'コンテナ・オーケストレーション',
      subcategory: '代表習熟度',
      displayOrder: 5,
      questions: [
        {
          text: '最も得意なコンテナ・オーケストレーション技術を1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'Docker',
            'Kubernetes',
            'Amazon ECS',
            'HashiCorp Nomad',
            'Docker Swarm',
            'その他',
          ]),
        },
        {
          text: '選んだ技術の習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── IaC・構成管理 ──
    {
      name: 'IaC・構成管理',
      subcategory: 'IaC・構成管理',
      displayOrder: 6,
      questions: [
        {
          text: '経験のある IaC・構成管理ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'Terraform',
            'OpenTofu',
            'AWS CloudFormation',
            'AWS CDK',
            'Pulumi',
            'Ansible',
            'Chef',
            'Puppet',
            'SaltStack',
          ]),
        },
        {
          text: 'IaC の運用実践で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'モジュール化・再利用',
            'リモートステート管理',
            'CI での plan/apply 自動化',
            'ドリフト検知・是正',
            'ポリシーアズコード（OPA/Sentinel/Conftest）',
            '複数環境（dev/stg/prod）の構成管理',
          ]),
        },
      ],
    },
    {
      name: 'IaC・構成管理',
      subcategory: '代表習熟度',
      displayOrder: 7,
      questions: [
        {
          text: '最も得意な IaC・構成管理ツールを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'Terraform',
            'OpenTofu',
            'AWS CloudFormation',
            'AWS CDK',
            'Pulumi',
            'Ansible',
            'その他',
          ]),
        },
        {
          text: '選んだツールの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── ネットワーク ──
    {
      name: 'ネットワーク',
      subcategory: 'ネットワーク基礎',
      displayOrder: 8,
      questions: [
        {
          text: 'ネットワークで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'TCP/IP・サブネット設計',
            'DNS の設計・運用',
            'ロードバランサ（L4/L7）',
            'VPC/VNet 設計',
            'VPN・専用線接続',
            'ファイアウォール・セキュリティグループ設計',
          ]),
        },
      ],
    },
    {
      name: 'ネットワーク',
      subcategory: 'Web・配信レイヤ',
      displayOrder: 9,
      questions: [
        {
          text: 'Web・配信レイヤで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'CDN（CloudFront/Cloud CDN/Fastly/Akamai）',
            'TLS 証明書の管理・更新自動化',
            'リバースプロキシ（Nginx/Envoy）',
            'WAF',
            'DDoS 対策',
          ]),
        },
      ],
    },
    {
      name: 'ネットワーク',
      subcategory: 'トラブルシュート',
      displayOrder: 10,
      questions: [
        {
          text: 'ネットワークのトラブルシュートで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'tcpdump/Wireshark によるパケット解析',
            'dig/nslookup による名前解決調査',
            'レイテンシ・到達性の切り分け',
            'MTU・経路（traceroute）問題の対応',
          ]),
        },
      ],
    },
    // ── CI/CD・デリバリー ──
    {
      name: 'CI/CD・デリバリー',
      subcategory: 'CI/CD',
      displayOrder: 11,
      questions: [
        {
          text: '経験のある CI/CD ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'GitHub Actions',
            'GitLab CI',
            'CircleCI',
            'Jenkins',
            'Argo CD',
            'Spinnaker',
            'AWS CodePipeline',
            'Google Cloud Build',
          ]),
        },
        {
          text: 'デリバリーパイプラインで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'ビルド・テスト自動化',
            'アーティファクト管理',
            '環境別デプロイ',
            '承認ゲート',
            'シークレット注入',
            'セルフホストランナーの運用',
          ]),
        },
      ],
    },
    {
      name: 'CI/CD・デリバリー',
      subcategory: 'デプロイ戦略',
      displayOrder: 12,
      questions: [
        {
          text: 'デプロイ戦略で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'ローリングアップデート',
            'Blue-Green デプロイ',
            'カナリアリリース',
            'Feature Flag による段階公開',
            'GitOps（宣言的デプロイ）',
            '自動ロールバック',
          ]),
        },
      ],
    },
    {
      name: 'CI/CD・デリバリー',
      subcategory: '代表習熟度',
      displayOrder: 13,
      questions: [
        {
          text: '最も得意な CI/CD ツールを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'GitHub Actions',
            'GitLab CI',
            'CircleCI',
            'Jenkins',
            'Argo CD',
            'AWS CodePipeline',
            'その他',
          ]),
        },
        {
          text: '選んだツールの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── OS・ミドルウェア ──
    {
      name: 'OS・ミドルウェア',
      subcategory: 'Linux',
      displayOrder: 14,
      questions: [
        {
          text: 'Linux 運用で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'シェルスクリプトによる運用自動化',
            'プロセス・リソース管理（top/ps/systemd）',
            'パッケージ管理',
            'パーミッション・ユーザー管理',
            'カーネルパラメータ（sysctl）チューニング',
            'ログ管理（journald/logrotate）',
          ]),
        },
      ],
    },
    {
      name: 'OS・ミドルウェア',
      subcategory: 'ミドルウェア',
      displayOrder: 15,
      questions: [
        {
          text: '運用経験のあるミドルウェアを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'Nginx/Apache',
            'MySQL/PostgreSQL',
            'Redis/Memcached',
            'Kafka/RabbitMQ',
            'Elasticsearch/OpenSearch',
          ]),
        },
        {
          text: 'サーバ・ミドルウェアの運用実践で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'バックアップ・リストア',
            'バージョンアップ・パッチ適用',
            'レプリケーション・冗長構成',
            '設定管理・チューニング',
          ]),
        },
      ],
    },
    // ══════════ SRE・信頼性層 ══════════
    // ── 可観測性 ──
    {
      name: '可観測性',
      subcategory: '三本柱',
      displayOrder: 16,
      questions: [
        {
          text: '可観測性で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'メトリクス収集',
            'ログ集約',
            '分散トレーシング',
            'ダッシュボード構築',
            'SLO ダッシュボードの構築',
          ]),
        },
        {
          text: '利用経験のある可観測性ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices([
            'Prometheus',
            'Grafana',
            'Datadog',
            'New Relic',
            'Elastic Stack（ELK）',
            'Grafana Loki',
            'Jaeger',
            'Grafana Tempo',
            'OpenTelemetry',
            'Amazon CloudWatch',
            'Google Cloud Monitoring',
          ]),
        },
      ],
    },
    {
      name: '可観測性',
      subcategory: 'アラート',
      displayOrder: 17,
      questions: [
        {
          text: 'アラート・通知設計で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            '閾値・異常検知アラート',
            'アラート疲れ対策（集約・抑制）',
            'オンコール通知連携（PagerDuty/Opsgenie）',
            'シンセティック・外形監視',
            'エラーレート・レイテンシの SLO アラート',
          ]),
        },
      ],
    },
    {
      name: '可観測性',
      subcategory: '代表習熟度',
      displayOrder: 18,
      questions: [
        {
          text: '最も得意な可観測性ツールを1つ選んでください。',
          questionType: 'single_choice',
          displayOrder: 0,
          choices: choices([
            'Prometheus/Grafana',
            'Datadog',
            'New Relic',
            'Elastic Stack',
            'OpenTelemetry',
            'その他',
          ]),
        },
        {
          text: '選んだツールの習熟度を教えてください。',
          questionType: 'single_choice',
          scoringKind: 'proficiency',
          displayOrder: 1,
          choices: PROFICIENCY_CHOICES,
        },
      ],
    },
    // ── 信頼性設計 ──
    {
      name: '信頼性設計',
      subcategory: 'SLI・SLO',
      displayOrder: 19,
      questions: [
        {
          text: 'SLI/SLO・信頼性指標で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'SLI の定義',
            'SLO の設定',
            'エラーバジェットの運用',
            'バーンレートアラート',
            '可用性・レイテンシ目標の合意形成',
          ]),
        },
      ],
    },
    {
      name: '信頼性設計',
      subcategory: '冗長化・回復性',
      displayOrder: 20,
      questions: [
        {
          text: '信頼性設計（冗長化・回復性）で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'マルチAZ・マルチリージョン冗長',
            'フェイルオーバー設計',
            'サーキットブレーカー/リトライ/タイムアウト',
            'グレースフルデグラデーション',
            'レート制限・バックプレッシャー',
            'ディザスタリカバリ（DR）設計',
          ]),
        },
      ],
    },
    {
      name: '信頼性設計',
      subcategory: 'キャパシティ・スケーリング',
      displayOrder: 21,
      questions: [
        {
          text: 'キャパシティプランニング・スケーリングで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            '負荷試験（k6/Gatling/JMeter）',
            'オートスケール設計',
            'キャパシティ予測',
            'ボトルネック分析',
            'カオスエンジニアリング（障害注入）',
          ]),
        },
      ],
    },
    // ── インシデント対応・オンコール ──
    {
      name: 'インシデント対応・オンコール',
      subcategory: 'インシデント対応',
      displayOrder: 22,
      questions: [
        {
          text: 'インシデント対応で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '一次対応・エスカレーション',
            'インシデントコマンダー',
            '復旧手順（Runbook）の整備',
            'ステークホルダー連携・障害報告',
          ]),
        },
      ],
    },
    {
      name: 'インシデント対応・オンコール',
      subcategory: 'ポストモーテム・再発防止',
      displayOrder: 23,
      questions: [
        {
          text: 'ポストモーテム・再発防止で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'ブレームレス・ポストモーテム',
            '根本原因分析（RCA）',
            'アクションアイテムの追跡',
            'ポストモーテム文化の醸成',
          ]),
        },
      ],
    },
    {
      name: 'インシデント対応・オンコール',
      subcategory: 'オンコール',
      displayOrder: 24,
      questions: [
        {
          text: 'オンコール運用で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'オンコールローテーション設計',
            'Runbook・プレイブック整備',
            'アラートのトリアージ',
            'オンコール負荷の計測・改善',
          ]),
        },
        {
          text: '経験した重大インシデントと、そこから得た学びがあれば記述してください。',
          questionType: 'free_text',
          displayOrder: 1,
          choices: [],
        },
      ],
    },
    // ── 自動化・トイル削減 ──
    {
      name: '自動化・トイル削減',
      subcategory: '運用自動化',
      displayOrder: 25,
      questions: [
        {
          text: '運用自動化・トイル削減で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '運用手順のスクリプト化',
            '定型作業のジョブ化・スケジュール実行',
            'セルフサービス基盤の提供',
            'ChatOps',
            '自動修復（オートリメディエーション）',
          ]),
        },
        {
          text: '自動化に用いた言語・ツールを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 1,
          choices: choices(['Bash', 'Python', 'Go', 'Ansible', 'Terraform', '各クラウドの SDK/CLI']),
        },
      ],
    },
    {
      name: '自動化・トイル削減',
      subcategory: 'プラットフォームエンジニアリング',
      displayOrder: 26,
      questions: [
        {
          text: 'プラットフォーム・開発者体験（DevEx）の取り組みで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            '内部開発者プラットフォーム（IDP）の構築',
            'ゴールデンパス・テンプレートの提供',
            'セルフサービスなインフラ払い出し',
            'ドキュメント・オンボーディング整備',
          ]),
        },
      ],
    },
    // ── セキュリティ・コンプライアンス ──
    {
      name: 'セキュリティ・コンプライアンス',
      subcategory: 'IAM・シークレット',
      displayOrder: 27,
      questions: [
        {
          text: 'クラウド・インフラのセキュリティで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            '最小権限の IAM 設計',
            'シークレット管理（Vault/Secrets Manager/SOPS）',
            'キーローテーション',
            'ネットワーク分離・ゼロトラスト',
            'mTLS',
          ]),
        },
      ],
    },
    {
      name: 'セキュリティ・コンプライアンス',
      subcategory: '脆弱性管理・サプライチェーン',
      displayOrder: 28,
      questions: [
        {
          text: '脆弱性管理・サプライチェーンで経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'コンテナイメージスキャン（Trivy/Snyk）',
            '依存パッケージの脆弱性スキャン',
            'IaC セキュリティスキャン（tfsec/Checkov）',
            'SBOM 管理',
            'パッチ運用',
          ]),
        },
      ],
    },
    {
      name: 'セキュリティ・コンプライアンス',
      subcategory: 'コンプライアンス・監査',
      displayOrder: 29,
      questions: [
        {
          text: 'コンプライアンス・監査対応で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            '監査ログの整備',
            'アクセス管理レビュー',
            'ポリシーアズコードによる統制',
            '各種基準対応（ISO 27001/SOC 2/PCI DSS など）',
          ]),
        },
      ],
    },
    // ── パフォーマンス・スケーラビリティ・コスト最適化 ──
    {
      name: 'パフォーマンス・スケーラビリティ・コスト最適化',
      subcategory: 'パフォーマンス',
      displayOrder: 30,
      questions: [
        {
          text: 'インフラのパフォーマンス最適化で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          isRequired: true,
          choices: choices([
            'ボトルネック特定（プロファイリング）',
            'DB・クエリ最適化',
            'キャッシュ戦略（CDN/アプリ/DB）',
            'コネクションプーリング',
            'レイテンシ改善',
          ]),
        },
      ],
    },
    {
      name: 'パフォーマンス・スケーラビリティ・コスト最適化',
      subcategory: 'スケーラビリティ',
      displayOrder: 31,
      questions: [
        {
          text: 'スケーラビリティ確保で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            '水平・垂直スケール設計',
            'ステートレス化',
            'シャーディング・レプリケーション',
            'キューによる負荷平準化',
            'グローバル分散',
          ]),
        },
      ],
    },
    {
      name: 'パフォーマンス・スケーラビリティ・コスト最適化',
      subcategory: 'コスト最適化（FinOps）',
      displayOrder: 32,
      questions: [
        {
          text: 'コスト最適化（FinOps）で経験のあるものを選択してください。',
          questionType: 'multi_choice',
          displayOrder: 0,
          choices: choices([
            'リソース使用率の可視化',
            'リザーブド/Savings Plans/コミット割引の活用',
            'スポット・プリエンプティブルの活用',
            '不要リソースの棚卸し',
            'コストアラート・予算管理',
            '適切なインスタンスタイプ選定',
          ]),
        },
      ],
    },
  ],
};

/**
 * infrastructure-sre スキルアンケートの seed を投入する（idempotent）。共通ランナーへ委譲する。
 */
export async function runInfrastructureSreSkillSurveySeed(db: DB): Promise<void> {
  await runSkillSurveySeed(db, infrastructureSreSurveySeed, { logLabel: 'infrastructure-sre' });
}
