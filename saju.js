// /api/saju.js
// Vercel Serverless Function (Node.js runtime)
// Reads secrets from Vercel environment variables (Project Settings -> Environment Variables):
//   OPENAI_API_KEY            - OpenAI API key
//   SUPABASE_URL              - e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (server-only, bypasses RLS)
// None of these are ever sent to the browser -- they are only read here, on the server.

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      description: '3~4문장의 재미있고 긍정적인 사주 스타일 해석 (한국어)',
    },
    main: {
      type: 'array',
      description: '1~45 사이의 서로 다른 정수 6개 (오름차순일 필요 없음)',
      items: { type: 'integer', minimum: 1, maximum: 45 },
      minItems: 6,
      maxItems: 6,
    },
    bonus: {
      type: 'integer',
      description: 'main과 겹치지 않는 1~45 사이의 보너스 번호',
      minimum: 1,
      maximum: 45,
    },
  },
  required: ['analysis', 'main', 'bonus'],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTIONS = `
당신은 재미로 사주(사주팔자) 스타일의 운세를 해석해주는 친근한 도우미입니다.
사용자의 생년월일, 태어난 시간, 성별을 참고해서, 오행(목화토금수)이나 천간지지 같은 사주 용어의 느낌을 가볍게 녹여
3~4문장 정도의 흥미로운 해석을 작성하세요.

규칙:
- 톤은 항상 밝고 긍정적으로 유지하세요. 질병, 사고, 죽음, 이별처럼 불안감을 줄 수 있는 내용은 절대 넣지 마세요.
- 이것은 과학적 사실이 아닌 재미 콘텐츠라는 것을 전제로, 과도하게 단정적인 표현은 피하세요.
- 해석의 분위기와 어울리는 느낌으로 1~45 사이의 서로 다른 숫자 6개(main)와, 그 6개와 겹치지 않는 보너스 숫자 1개(bonus)를 골라주세요.
- 반드시 주어진 JSON 스키마 형식으로만 응답하세요.
`.trim();

const VALID_GENDERS = ['male', 'female', 'unspecified'];

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        const textItem = item.content.find(
          (c) => c.type === 'output_text' && typeof c.text === 'string'
        );
        if (textItem) return textItem.text;
      }
    }
  }
  throw new Error('Could not find text content in model response');
}

function sanitizeResult(parsed) {
  let main = Array.isArray(parsed.main)
    ? parsed.main.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
    : [];
  main = [...new Set(main)];

  while (main.length < 6) {
    const candidate = 1 + Math.floor(Math.random() * 45);
    if (!main.includes(candidate)) main.push(candidate);
  }
  main = main.slice(0, 6).sort((a, b) => a - b);

  let bonus =
    Number.isInteger(parsed.bonus) && parsed.bonus >= 1 && parsed.bonus <= 45
      ? parsed.bonus
      : null;
  if (bonus === null || main.includes(bonus)) {
    do {
      bonus = 1 + Math.floor(Math.random() * 45);
    } while (main.includes(bonus));
  }

  const analysis =
    typeof parsed.analysis === 'string' && parsed.analysis.trim().length > 0
      ? parsed.analysis.trim()
      : '오늘은 그동안 미뤄뒀던 일을 시작해보기 좋은 날이에요. 직감을 믿고 가벼운 마음으로 골라봤어요.';

  return { analysis, main, bonus };
}

function sanitizeGender(value) {
  return VALID_GENDERS.includes(value) ? value : 'unspecified';
}

// Fire-and-await insert into Supabase via the REST (PostgREST) endpoint, using the
// service role key. This never touches the browser and RLS can stay fully locked down
// (no public policies needed) since the service role bypasses RLS entirely.
async function saveToSupabase(record) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { saved: false, reason: 'Supabase env vars not configured' };
  }

  try {
    const res = await fetch(`${url}/rest/v1/saju_draws`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([record]),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { saved: false, reason: errText };
    }
    return { saved: true };
  } catch (err) {
    return { saved: false, reason: String(err) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { birthDate, birthTime, gender } = req.body || {};

  if (!birthDate || typeof birthDate !== 'string') {
    res.status(400).json({ error: 'birthDate is required (YYYY-MM-DD)' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
    return;
  }

  const cleanGender = sanitizeGender(gender);
  const cleanBirthTime =
    birthTime && typeof birthTime === 'string' && birthTime.length > 0 ? birthTime : null;

  const genderLabel =
    cleanGender === 'male' ? '남성' : cleanGender === 'female' ? '여성' : '선택 안 함';

  const userInput = `생년월일: ${birthDate}\n태어난 시간: ${
    cleanBirthTime || '모름'
  }\n성별: ${genderLabel}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        instructions: SYSTEM_INSTRUCTIONS,
        input: userInput,
        text: {
          format: {
            type: 'json_schema',
            name: 'saju_lotto_result',
            strict: true,
            schema: RESULT_SCHEMA,
          },
        },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      res.status(502).json({ error: 'Upstream model request failed', detail: errText });
      return;
    }

    const data = await openaiRes.json();
    const rawText = extractResponseText(data);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse model output as JSON' });
      return;
    }

    const clean = sanitizeResult(parsed);

    const { saved } = await saveToSupabase({
      birth_date: birthDate,
      birth_time: cleanBirthTime,
      gender: cleanGender,
      analysis: clean.analysis,
      main_numbers: clean.main,
      bonus_number: clean.bonus,
    });

    res.status(200).json({ ...clean, saved });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error', detail: String(err) });
  }
}

