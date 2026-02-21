#!/usr/bin/env node
/**
 * 予約確認メール送信スクリプト（Gmail API 使用・Edge Function と同じ内容をローカルから実行）
 *
 * 使い方:
 *   npm run send-reservation-email
 *   node --env-file=.env.local scripts/send-reservation-email.mjs scripts/payload-reservation-email.json
 *
 * 環境変数:
 *   GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, GOOGLE_GMAIL_REFRESH_TOKEN
 *   任意: GOOGLE_GMAIL_FROM_EMAIL, GOOGLE_GMAIL_FROM_NAME
 *
 * JSON の例（scripts/payload-reservation-email.example.json）:
 *   {
 *     "email": "customer@example.com",
 *     "parent_name": "山田 花子",
 *     "parent_name_kana": "ヤマダ ハナコ",
 *     "child_name": "山田 太郎",
 *     "child_name_kana": "ヤマダ タロウ",
 *     "child_age_years": 2,
 *     "child_age_months": 3,
 *     "reservation_number": "RSV-2026-00001",
 *     "reservation_date_time": "2026-03-01T10:00:00",
 *     "menu_name": "手形・足形セット",
 *     "location_name": "豊川店"
 *   }
 */

import { readFileSync } from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const FROM_NAME = process.env.GOOGLE_GMAIL_FROM_NAME || 'Amorétto LifeCastingstudio';

function loadPayload() {
  const path = process.argv[2];
  if (path) {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  }
  return {
    email: process.env.TEST_EMAIL || 'test@example.com',
    parent_name: 'テスト 保護者',
    parent_name_kana: 'テスト ホゴシャ',
    child_name: 'テスト お子様',
    child_name_kana: 'テスト オコサマ',
    child_age_years: 1,
    child_age_months: 6,
    reservation_number: 'RSV-TEST-001',
    reservation_date_time: new Date().toISOString().slice(0, 16).replace('T', 'T'),
    menu_name: '手形・足形セット',
    location_name: '豊川店',
  };
}

function buildEmailHtml(p) {
  const parent_name = p.parent_name || 'お客様';
  const parent_name_kana = p.parent_name_kana || '';
  const child_name = p.child_name || '';
  const child_name_kana = p.child_name_kana || '';
  const child_age_years = p.child_age_years != null ? p.child_age_years : null;
  const child_age_months = p.child_age_months != null ? p.child_age_months : null;
  const reservationNumber = p.reservation_number || '---';
  const menuName = p.menu_name || '-';
  const locationName = p.location_name || '-';

  const dt = p.reservation_date_time ? new Date(p.reservation_date_time) : new Date();
  const dateStr = dt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const timeStr = dt.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const childAgeStr =
    child_age_years !== null || child_age_months !== null
      ? ` (${child_age_years ?? 0}歳${child_age_months ? ` ${child_age_months}ヶ月` : ''})`
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans JP', -apple-system, sans-serif; line-height: 1.8; color: #2C2C2C; background-color: #F8F6F3; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(196, 169, 98, 0.1); }
    .header { background: linear-gradient(135deg, #C4A962 0%, #D4B982 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { font-size: 32px; margin-bottom: 8px; letter-spacing: 0.05em; }
    .header p { font-size: 14px; opacity: 0.95; letter-spacing: 0.1em; }
    .content { background: #FFFFFF; padding: 40px 30px; }
    .greeting { font-size: 18px; color: #2C2C2C; margin-bottom: 24px; }
    .message { color: #666666; margin-bottom: 32px; line-height: 1.8; }
    .info-box { background: #F8F6F3; padding: 24px; margin: 28px 0; border-radius: 8px; border-left: 4px solid #C4A962; }
    .info-row { margin: 14px 0; display: flex; align-items: flex-start; }
    .label { font-weight: 600; color: #C4A962; min-width: 100px; flex-shrink: 0; }
    .value { color: #2C2C2C; flex: 1; }
    .notice-box { background: #FFF9E6; border: 1px solid #E5E0D8; border-left: 4px solid #C4A962; padding: 24px; margin: 28px 0; border-radius: 8px; }
    .notice-title { font-weight: 600; color: #2C2C2C; margin-bottom: 12px; font-size: 16px; }
    .notice-text { color: #666666; margin-bottom: 16px; line-height: 1.8; }
    .footer { text-align: center; padding: 24px 30px; background: #F8F6F3; color: #999999; font-size: 13px; line-height: 1.6; }
    .divider { height: 1px; background: #E5E0D8; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Amorétto</h1>
      <p>ライフキャスティング専門店</p>
    </div>
    <div class="content">
      <div class="greeting">${parent_name} 様</div>
      <div class="message">
        この度はAmoréttoにご予約いただき、誠にありがとうございます。<br>
        以下の内容で仮予約を承りました。
      </div>
      <div class="info-box">
        <div class="info-row"><span class="label">予約番号</span><span class="value" style="font-family: monospace; font-size: 18px; font-weight: 600; color: #C4A962;">${reservationNumber}</span></div>
        <div class="divider"></div>
        <div class="info-row"><span class="label">予約日時</span><span class="value">${dateStr} ${timeStr}</span></div>
        <div class="info-row"><span class="label">メニュー</span><span class="value">${menuName}</span></div>
        <div class="info-row"><span class="label">店舗</span><span class="value">${locationName}</span></div>
        <div class="divider"></div>
        <div class="info-row"><span class="label">保護者様</span><span class="value">${parent_name}${parent_name_kana ? ` （${parent_name_kana}）` : ''}</span></div>
        <div class="info-row"><span class="label">お子様</span><span class="value">${child_name}${child_name_kana ? ` （${child_name_kana}）` : ''}${childAgeStr}</span></div>
      </div>
      <div class="notice-box">
        <div class="notice-title">📋 ご来店前のお願い</div>
        <div class="notice-text">
          ・予約時間の10分前までにご来店ください<br>
          ・遅れる場合は必ずお電話にてご連絡ください<br>
          ・ご予約の変更・キャンセルをご希望の場合は、お電話・メール・公式LINEにてご連絡ください<br>
          ・当日キャンセルの場合はキャンセル料が発生する場合がございます
        </div>
      </div>
      <div class="notice-box" style="background: linear-gradient(135deg, #E8F8F5 0%, #E1F5FE 100%); border-left: 4px solid #06C755;">
        <div class="notice-title" style="color: #06C755;">💬 公式LINE</div>
        <div class="notice-text">
          変更・キャンセルは公式LINEからも受け付けております<br>
          <a href="https://lin.ee/LbmijXx" style="color: #06C755; text-decoration: underline;">https://lin.ee/LbmijXx</a>
        </div>
      </div>
      <div style="color: #666666; margin-top: 32px; line-height: 1.8;">
        ご不明な点がございましたら、お気軽にお問い合わせください。<br>
        スタッフ一同、心よりお待ちしております。
      </div>
    </div>
    <div class="footer">
      Amorétto ライフキャスティング専門店<br>
      このメールは送信専用です。ご返信いただいてもお答えできませんのでご了承ください。
    </div>
  </div>
</body>
</html>
`;
}

function utf8ToBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function buildRawMessage(from, to, toName, subject, html) {
  const lines = [
    `From: ${FROM_NAME} <${from}>`,
    `To: ${toName ? `${toName} <${to}>` : to}`,
    `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(html),
  ];
  const raw = lines.join('\r\n');
  const rawB64 = utf8ToBase64(raw);
  return rawB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getFromEmail(gmail) {
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress || '';
}

async function main() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error(
      'GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET / GOOGLE_GMAIL_REFRESH_TOKEN を .env.local に設定してください。'
    );
    process.exit(1);
  }

  const payload = loadPayload();
  const email = payload.email;
  if (!email) {
    console.error('ペイロードに email がありません。');
    process.exit(1);
  }

  const htmlContent = buildEmailHtml(payload);
  const subject = `【アマレット】ご予約を承りました（予約番号: ${payload.reservation_number || '---'}）`;

  console.log('送信先:', email);
  console.log('件名:', subject);
  console.log('Gmail API で送信中...');

  const oauth2 = new OAuth2Client(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const fromEmail = process.env.GOOGLE_GMAIL_FROM_EMAIL || (await getFromEmail(gmail));
  if (!fromEmail) {
    console.error('送信元メールアドレスを取得できません。GOOGLE_GMAIL_FROM_EMAIL を設定するか、リフレッシュトークンが Gmail アカウントに紐づいているか確認してください。');
    process.exit(1);
  }

  const raw = buildRawMessage(fromEmail, email, payload.parent_name || '', subject, htmlContent);
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log('送信成功。メッセージID:', res.data.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
