// 간편장부 — 로그인 / 개인정보 / 사업장
//
// Supabase 에 붙어서 이메일 가입·로그인을 처리한다.
// 아래 두 값은 브라우저에 그대로 드러나는 공개용 값이다. 숨길 필요가 없다.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

const SUPABASE_URL = "https://kqawkddxcsdjsmnjsjix.supabase.co";
const SUPABASE_KEY = "sb_publishable_eg6TGqmzNEbKu1ywiZGl8w_dbIcgkW1";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // 창을 닫으면 로그인이 풀린다. 다시 들어오면 로그인 화면부터 뜬다.
  auth: { persistSession: false, autoRefreshToken: false },
});

// 화면 조각들
const loggedOut = document.getElementById("loggedOut");
const loggedIn  = document.getElementById("loggedIn");
const who       = document.getElementById("who");
const msg       = document.getElementById("msg");
const form      = document.getElementById("authForm");
const emailBox  = document.getElementById("email");
const pwBox     = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

// 로그인 상태에 따라 화면을 바꾼다
function draw(session) {
  const 로그인됨 = Boolean(session);
  loggedOut.hidden = 로그인됨;
  loggedIn.hidden  = !로그인됨;
  who.textContent  = 로그인됨 ? session.user.email : "";

  if (로그인됨) {
    // 업태·종목 칸이 비어 있으면 한 줄 만들어 둔다
    if (industryRows.children.length === 0) {
      industryRows.appendChild(업종줄());
      첫줄만필수();
    }
    개인정보불러오기();
    사업장목록();
  } else {
    개인정보비우기();
    편집끝내기();
    bizList.replaceChildren();
    사업장들 = [];
    장부칸그리기();
  }
}

// Supabase 가 보내는 영어 문구를 한글로 바꾼다.
// 여기 없는 것은 영어 그대로 보여준다 (새 문구가 나오면 눈에 띄게 하려고).
const 오류문구 = {
  "Invalid login credentials": "이메일이나 비밀번호가 올바르지 않습니다. 처음이시면 회원가입을 눌러주세요.",
  "Password should be at least 6 characters.": "비밀번호는 6자 이상이어야 합니다.",
  "Unable to validate email address: invalid format": "이메일 주소를 확인할 수 없습니다.",
  "missing email or phone": "이메일 주소를 입력해야 합니다.",
};

// DB 가 거절할 때 나오는 영어에는 칸 이름이 영문으로 들어 있다. 화면에 쓰는 말로 바꾼다.
const 칸이름 = {
  profiles: {
    name: "성명", rrn: "주민등록번호", address: "주소",
    phone_home: "일반전화", phone_mobile: "휴대전화",
    book_duty: "기장의무", report_type: "신고유형", report_kind: "신고구분",
    tax_office: "관할세무서", local_gov: "관할지자체",
  },
  businesses: {
    tax_type: "과세유형", biz_no: "등록번호", name: "상호", owner_name: "성명",
    opened_on: "개업 연월일", address: "사업장 소재지",
    co_owners: "공동사업자", unit_tax: "사업자 단위 과세",
  },
};

// 두 칸을 같이 보는 조건(check)에 걸렸을 때
const 조건이름 = {
  "전화_둘중_하나": "일반전화와 휴대전화 중 하나는 입력해야 합니다.",
  "industries_at_least_one": "업태와 종목을 한 줄 이상 입력해야 합니다.",
};

function 한글로(error) {
  const 말 = error.message;

  if (오류문구[말]) return 오류문구[말];

  // null value in column "rrn" of relation "profiles" violates not-null constraint
  const 빈칸 = 말.match(/null value in column "(.+?)" of relation "(.+?)"/);
  if (빈칸) {
    const 이름 = 칸이름[빈칸[2]]?.[빈칸[1]];
    if (이름) return `${이름}을(를) 입력해야 합니다.`;
  }

  // new row for relation "profiles" violates check constraint "전화_둘중_하나"
  const 조건 = 말.match(/violates check constraint "(.+?)"/);
  if (조건 && 조건이름[조건[1]]) return 조건이름[조건[1]];

  return 말;
}

// 안내 문구 한 줄.
// 잘 된 경우는 몇 초 뒤 저절로 사라지고, 오류는 계속 두기를 켜서 남긴다.
let 문구타이머;
// 안내 문구. 무엇이든 잠깐 보였다가 저절로 사라진다.
function say(text) {
  clearTimeout(문구타이머);
  msg.textContent = text;
  if (text) {
    문구타이머 = setTimeout(() => { msg.textContent = ""; }, 1200);
  }
}

// 갓 로그인한 순간에는 증표(토큰)의 발급 시각이 서버 기준으로 아주 살짝 미래여서
// 첫 요청이 "JWT issued at future" 로 한 번 튕길 때가 있다.
// 실패하면 잠깐 쉬었다 한 번 더 해본다. 그래도 안 되면 그때 문구를 보여준다.
async function 한번더(일) {
  let 답 = await 일();
  if (답.error) {
    await new Promise((멈춤) => setTimeout(멈춤, 700));
    답 = await 일();
  }
  return 답;
}

// 로그인
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  say("");
  const { error } = await supabase.auth.signInWithPassword({
    email: emailBox.value,
    password: pwBox.value,
  });
  if (error) say(한글로(error));
});

// 회원가입
signupBtn.addEventListener("click", async () => {
  say("");
  if (!emailBox.value || !pwBox.value) {
    say("이메일 주소를 입력해야 합니다.");
    return;
  }
  const { error } = await supabase.auth.signUp({
    email: emailBox.value,
    password: pwBox.value,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) {
    say(한글로(error));
  } else {
    say("확인 메일을 보냈습니다. 메일의 링크를 눌러야 가입이 끝납니다.");
  }
});

// 로그아웃
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  emailBox.value = "";
  pwBox.value = "";
  say("");
});


// ============================================================
// 개인정보 — 한 사람당 한 줄. 저장하면 덮어쓴다
// ============================================================

const profileForm = document.getElementById("profileForm");

const 개인칸 = {
  name:         document.getElementById("pName"),
  rrn:          document.getElementById("pRrn"),
  address:      document.getElementById("pAddress"),
  phone_home:   document.getElementById("pPhoneHome"),
  phone_mobile: document.getElementById("pPhoneMobile"),
  book_duty:    document.getElementById("pBookDuty"),
  report_type:  document.getElementById("pReportType"),
  report_kind:  document.getElementById("pReportKind"),
  tax_office:   document.getElementById("pTaxOffice"),
  local_gov:    document.getElementById("pLocalGov"),
};

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  say("");

  // 저장해둔 세션에서 바로 꺼낸다 (getUser 는 서버에 다시 물어보느라 null 이 나올 때가 있다)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    say("로그인이 풀렸습니다. 다시 로그인해주세요.");
    return;
  }

  // 전화는 둘 중 하나만 있으면 된다.
  // required 는 칸 하나씩만 볼 줄 알아서 "둘 중 하나"를 말할 수 없다. 그래서 여기서 직접 본다.
  if (!개인칸.phone_home.value.trim() && !개인칸.phone_mobile.value.trim()) {
    say("일반전화와 휴대전화 중 하나는 입력해야 합니다.");
    개인칸.phone_mobile.focus();
    return;
  }

  const 값 = { user_id: session.user.id };
  for (const [이름, 칸] of Object.entries(개인칸)) {
    값[이름] = 칸.value.trim() || null;
  }

  const { error } = await supabase.from("profiles").upsert(값, { onConflict: "user_id" });
  if (error) {
    say(한글로(error));
    return;
  }
  say("개인정보를 저장했습니다.");
});

// 저장해둔 것이 있으면 칸에 채운다
async function 개인정보불러오기() {
  const { data, error } = await 한번더(() =>
    supabase.from("profiles").select("*").maybeSingle()
  );
  if (error) {
    say(error.message);
    return;
  }
  for (const [이름, 칸] of Object.entries(개인칸)) {
    칸.value = data?.[이름] ?? "";
  }
}

function 개인정보비우기() {
  for (const 칸 of Object.values(개인칸)) 칸.value = "";
}


// ============================================================
// 사업장 — 등록 / 목록 / 고르기 / 수정 / 삭제
// ============================================================

const bizForm      = document.getElementById("bizForm");
const industryRows = document.getElementById("industryRows");
const addIndustry  = document.getElementById("addIndustry");
const bizList      = document.getElementById("bizList");
const saveBiz      = document.getElementById("saveBiz");
const cancelEdit   = document.getElementById("cancelEdit");
const ledger       = document.getElementById("ledger");
const ledgerTitle  = document.getElementById("ledgerTitle");
const fileInput    = document.getElementById("fileInput");
const uploadBtn    = document.getElementById("uploadBtn");
const viewLedgerBtn = document.getElementById("viewLedgerBtn");
const ledgerTable  = document.getElementById("ledgerTable");
const setup        = document.getElementById("setup");
const ledgerScreen = document.getElementById("ledgerScreen");
const ledgerScreenTitle = document.getElementById("ledgerScreenTitle");
const backBtn      = document.getElementById("backBtn");
const confirmRemove = document.getElementById("confirmRemove");
const confirmYes   = document.getElementById("confirmYes");
const confirmNo    = document.getElementById("confirmNo");
const deleteBtn    = document.getElementById("deleteBtn");
const saveLedgerBtn = document.getElementById("saveLedgerBtn");

// 지금 고른 사업장. 다음 단계(장부 저장)에서 쓴다.
let 고른사업장 = localStorage.getItem("고른사업장") ?? "";

// 방금 불러온 사업장 목록. 고른 것의 상호를 제목에 쓰려고 들고 있는다.
let 사업장들 = [];

// 수정 중인 사업장. 비어 있으면 새로 등록하는 것이다.
let 수정중 = "";

// 폼의 칸들
const 칸 = {
  tax_type:   document.getElementById("taxType"),
  biz_no:     document.getElementById("bizNo"),
  name:       document.getElementById("bizName"),
  owner_name: document.getElementById("ownerName"),
  opened_on:  document.getElementById("openedOn"),
  address:    document.getElementById("address"),
};

// 사업자 단위 과세 — 예/아니오 중 하나를 반드시 고른다
const 단위과세단추 = [...document.querySelectorAll('input[name="unitTax"]')];
const 단위과세읽기 = () =>
  단위과세단추.find((단추) => 단추.checked)?.value === "예";
const 단위과세쓰기 = (값) => {
  for (const 단추 of 단위과세단추) {
    단추.checked = 값 === null ? false : 단추.value === (값 ? "예" : "아니오");
  }
};

// 공동사업자 — 예/아니오 중 하나를 반드시 고른다.
// DB 칸(co_owners)은 글자라서 고른 값을 그대로 넣는다.
const 공동사업자단추 = [...document.querySelectorAll('input[name="coOwners"]')];
const 공동사업자읽기 = () =>
  공동사업자단추.find((단추) => 단추.checked)?.value ?? "";
const 공동사업자쓰기 = (값) => {
  for (const 단추 of 공동사업자단추) {
    단추.checked = 단추.value === 값;
  }
};

// 업태·종목 한 줄을 만든다
function 업종줄(값 = { 업태: "", 종목: "" }) {
  const 줄 = document.createElement("div");
  줄.className = "업종줄";

  const 업태 = document.createElement("input");
  업태.className = "업태";
  업태.type = "text";
  업태.placeholder = "업태";
  업태.value = 값.업태 ?? "";

  const 종목 = document.createElement("input");
  종목.className = "종목";
  종목.type = "text";
  종목.placeholder = "종목";
  종목.value = 값.종목 ?? "";

  줄.append(업태, 종목);
  return 줄;
}

// 업태·종목은 첫 줄만 반드시 채운다. 줄 추가해놓고 비워둔 것은 저장할 때 버린다.
function 첫줄만필수() {
  industryRows.querySelectorAll(".업종줄").forEach((줄, 번호) => {
    for (const 칸 of 줄.children) 칸.required = 번호 === 0;
  });
}

addIndustry.addEventListener("click", () => {
  industryRows.appendChild(업종줄());
  첫줄만필수();
});

// 화면의 업태·종목 줄을 모아서 배열로 만든다. 둘 다 빈 줄은 버린다.
function 업종모으기() {
  return [...industryRows.querySelectorAll(".업종줄")]
    .map((줄) => ({
      업태: 줄.querySelector(".업태").value.trim(),
      종목: 줄.querySelector(".종목").value.trim(),
    }))
    .filter((칸) => 칸.업태 || 칸.종목);
}

// 폼에 적힌 것을 모아 한 줄로 만든다
function 폼읽기() {
  return {
    tax_type:   칸.tax_type.value || null,
    biz_no:     칸.biz_no.value.trim(),
    name:       칸.name.value.trim(),
    owner_name: 칸.owner_name.value.trim() || null,
    opened_on:  칸.opened_on.value || null,
    address:    칸.address.value.trim() || null,
    industries: 업종모으기(),
    co_owners:  공동사업자읽기(),
    unit_tax:   단위과세읽기(),
  };
}

// 등록 / 수정 저장
bizForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  say("");

  const 값 = 폼읽기();
  const { error } = 수정중
    ? await supabase.from("businesses").update(값).eq("id", 수정중)
    : await supabase.from("businesses").insert(값);

  if (error) {
    say(한글로(error));
    return;
  }

  편집끝내기();
  await 사업장목록();
});

// 수정하던 것을 접고 폼을 비운다
function 편집끝내기() {
  수정중 = "";
  bizForm.reset();
  공동사업자쓰기(null);
  단위과세쓰기(null);
  industryRows.replaceChildren(업종줄());
  첫줄만필수();
  saveBiz.textContent = "등록";
  cancelEdit.hidden = true;
}

cancelEdit.addEventListener("click", () => {
  say("");
  편집끝내기();
});

// 고른 줄을 폼으로 옮긴다
function 수정하기(사업장) {
  수정중 = 사업장.id;

  칸.tax_type.value   = 사업장.tax_type ?? "";
  칸.biz_no.value     = 사업장.biz_no ?? "";
  칸.name.value       = 사업장.name ?? "";
  칸.owner_name.value = 사업장.owner_name ?? "";
  칸.opened_on.value  = 사업장.opened_on ?? "";
  칸.address.value    = 사업장.address ?? "";
  공동사업자쓰기(사업장.co_owners ?? "");
  단위과세쓰기(Boolean(사업장.unit_tax));

  const 업종들 = 사업장.industries?.length ? 사업장.industries : [{ 업태: "", 종목: "" }];
  industryRows.replaceChildren(...업종들.map(업종줄));
  첫줄만필수();

  saveBiz.textContent = "수정 저장";
  cancelEdit.hidden = false;
  bizForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function 삭제하기(사업장) {
  const { error } = await supabase.from("businesses").delete().eq("id", 사업장.id);
  if (error) {
    say(error.message);
    return;
  }

  if (수정중 === 사업장.id) 편집끝내기();
  await 사업장목록();
}

// 목록을 불러와 그린다
async function 사업장목록() {
  const { data, error } = await 한번더(() =>
    supabase.from("businesses").select("*").order("created_at")
  );

  if (error) {
    say(error.message);
    return;
  }

  사업장들 = data;
  bizList.replaceChildren();

  if (data.length === 0) {
    bizList.textContent = "등록한 사업장이 없습니다.";
    장부칸그리기();
    return;
  }

  // 고른 것이 목록에 없으면(다른 계정으로 바뀐 경우) 첫 줄을 고른다
  const 고른것있음 = data.some((사업장) => 사업장.id === 고른사업장);
  고르기(고른것있음 ? 고른사업장 : data[0].id);

  for (const 사업장 of data) {
    const 줄 = document.createElement("div");
    줄.className = "사업장줄";

    const 고름 = document.createElement("label");
    const 단추 = document.createElement("input");
    단추.type = "radio";
    단추.name = "고른사업장";
    단추.checked = 사업장.id === 고른사업장;
    단추.addEventListener("change", () => 고르기(사업장.id));
    고름.append(단추, ` ${사업장.name} (${사업장.biz_no})`);

    const 수정버튼 = document.createElement("button");
    수정버튼.type = "button";
    수정버튼.className = "작은버튼";
    수정버튼.textContent = "수정";
    수정버튼.addEventListener("click", () => 수정하기(사업장));

    const 삭제버튼 = document.createElement("button");
    삭제버튼.type = "button";
    삭제버튼.className = "작은버튼";
    삭제버튼.textContent = "삭제";
    // 브라우저 확인창(confirm)은 뜨지 않는 곳이 있어서, 두 번 눌러 확인받는다
    삭제버튼.addEventListener("click", () => {
      if (삭제버튼.dataset.확인 !== "1") {
        삭제버튼.dataset.확인 = "1";
        삭제버튼.textContent = "정말 지울까요?";
        setTimeout(() => {
          삭제버튼.dataset.확인 = "";
          삭제버튼.textContent = "삭제";
        }, 3000);
        return;
      }
      삭제하기(사업장);
    });

    줄.append(고름, 수정버튼, 삭제버튼);
    bizList.appendChild(줄);
  }
}

function 고르기(id) {
  고른사업장 = id;
  localStorage.setItem("고른사업장", id);
  장부칸그리기();
}


// ============================================================
// 간편장부 — 고른 사업장의 파일을 받는 자리
// ============================================================

// 제목에 고른 사업장의 상호와 등록번호를 적는다.
// 고른 사업장이 없으면 올릴 자리도 없으므로 칸째로 감춘다.
function 장부칸그리기() {
  const 사업장 = 사업장들.find((하나) => 하나.id === 고른사업장);
  ledger.hidden = !사업장;
  ledgerTitle.textContent = 사업장 ? `${기준연도}년 귀속 간편장부 — ${사업장.name} (${사업장.biz_no})` : "";
  if (!사업장) 고른파일비우기();
}

// 우리 버튼을 누르면 감춰둔 파일 칸을 대신 연다
uploadBtn.addEventListener("click", () => fileInput.click());

// 파일을 올리면 이미 읽어둔 장부에 이어 붙인다.
// 예전 내용을 지우지 않는다 — 여러 번 나눠 올릴 수 있어야 한다.
fileInput.addEventListener("change", async () => {
  if (fileInput.files.length === 0) return;

  const 사업장 = 사업장들.find((하나) => 하나.id === 고른사업장);
  const 읽기전 = 장부.length;

  for (const 파일 of fileInput.files) {
    try {
      장부.push(...(await 파일읽기(파일, 사업장)));
    } catch (탈) {
      say(`${파일.name} 을(를) 읽지 못했습니다. (${탈.message})`);
    }
  }

  say(`${장부.length - 읽기전}건을 더 읽었습니다. 모두 ${장부.length}건입니다.`);

  날짜순으로();
  장부그리기();
  if (장부.length > 0) 장부화면으로();

  // 고른 파일을 비운다. 비우지 않으면 브라우저가 '바뀐 것 없음' 으로 보고
  // 같은 파일을 다시 골랐을 때 아무 일도 일어나지 않는다.
  // 같은 파일이든 다른 파일이든 일단 올라가야 한다 (중복은 나중에 따로 뺀다)
  fileInput.value = "";
});

// 장부는 날짜 순서다. 파일을 여러 개 올려도 섞어서 오래된 것부터 놓는다.
// 일자는 2026-05-31 모양이라 글자 그대로 견주면 날짜 순서가 된다.
// 일자가 빈 줄은 맨 뒤로 보낸다.
function 날짜순으로() {
  장부.sort((앞, 뒤) => {
    if (!앞.일자) return 1;
    if (!뒤.일자) return -1;
    return 앞.일자 < 뒤.일자 ? -1 : 앞.일자 > 뒤.일자 ? 1 : 0;
  });
}

// 화면 두 개를 오간다. 파일을 올리면 장부만 남고, 뒤로 누르면 등록 화면으로 돌아온다.
function 장부화면으로() {
  ledgerScreenTitle.textContent = ledgerTitle.textContent;
  setup.hidden = true;
  ledgerScreen.hidden = false;
  // 표가 넓어서 장부 화면에서만 본문 폭 제한(30rem)을 푼다 (styles.css 의 body.장부중)
  document.body.classList.add("장부중");
  window.scrollTo(0, 0);
}

function 등록화면으로() {
  ledgerScreen.hidden = true;
  setup.hidden = false;
  document.body.classList.remove("장부중");
  window.scrollTo(0, 0);
}

backBtn.addEventListener("click", 등록화면으로);

function 고른파일비우기() {
  fileInput.value = "";
  장부 = [];
  ledgerTable.replaceChildren();
  등록화면으로();
}


// ============================================================
// 파일을 읽어 간편장부 8개 항목으로 옮긴다
// 어느 열을 어디에 넣는지는 RULES.md 에 적혀 있다
// ============================================================

// 옮겨 담은 장부 줄들. 파일을 여러 개 올리면 이어 붙는다.
let 장부 = [];

const 글자 = (값) => String(값 ?? "").trim();
const 숫자만 = (값) => 글자(값).replace(/\D/g, "");

// "1,234" 같은 글자도 숫자로 본다. 숫자가 아니면 빈 칸으로 둔다.
function 숫자로(값) {
  if (값 === "" || 값 === null || 값 === undefined) return "";
  const 수 = Number(글자(값).replace(/,/g, ""));
  return Number.isFinite(수) ? 수 : "";
}

// 날짜 칸은 세 가지 모양으로 들어온다.
//   엑셀 날짜값 / 2026-12-31 (세금계산서) / 2026.01.01 (카드)
// 장부에서는 전부 2026-12-31 모양으로 맞춘다. 그래야 정렬과 연도 보기가 된다.
function 날짜로(값) {
  if (값 instanceof Date) {
    const 두자리 = (수) => String(수).padStart(2, "0");
    return `${값.getFullYear()}-${두자리(값.getMonth() + 1)}-${두자리(값.getDate())}`;
  }
  return 글자(값).replace(/\./g, "-");
}

// 날짜가 들어 있는 칸인지 본다. 합계 줄이나 빈 줄을 걸러내는 데 쓴다.
function 날짜모양(값) {
  if (값 instanceof Date) return true;
  return /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(글자(값));
}

// 파일은 두 가지다. 머리글에 어떤 글자가 있는지로 가린다.
//   세금계산서 목록 — 작성일자 가 있다 (표가 6행부터 시작)
//   카드 이용내역   — 매출일자 가 있다 (표가 1행부터 시작)
// 줄 번호를 박아두지 않으므로 표가 몇 행부터 시작하든 된다.

async function 파일읽기(파일, 사업장) {
  const 통 = XLSX.read(await 파일.arrayBuffer(), { cellDates: true });
  const 장 = 통.Sheets[통.SheetNames[0]];
  const 줄들 = XLSX.utils.sheet_to_json(장, { header: 1, defval: "" });

  const 머리찾기 = (이름) =>
    줄들.findIndex((줄) => 줄.some((칸) => 글자(칸) === 이름));

  const 세금계산서머리 = 머리찾기("작성일자");
  if (세금계산서머리 >= 0) return 세금계산서읽기(줄들, 세금계산서머리, 사업장);

  const 카드머리 = 머리찾기("매출일자");
  if (카드머리 >= 0) return 카드읽기(줄들, 카드머리);

  throw new Error("작성일자나 매출일자 열을 찾지 못했습니다");
}


// ------------------------------------------------------------
// 세금계산서 목록 — 매출·매입을 등록번호로 가린다
// ------------------------------------------------------------

// 상호·대표자명·주소는 이름이 두 번 나온다(공급자 쪽, 공급받는자 쪽).
// 그래서 등록번호 열 뒤에서 찾아 가린다.
function 세금계산서자리(머리) {
  const 찾기 = (이름, 시작 = 0) => 머리.indexOf(이름, 시작);
  const 공급자 = 찾기("공급자사업자등록번호");
  const 공급받는자 = 찾기("공급받는자사업자등록번호");

  return {
    작성일자:        찾기("작성일자"),
    공급자등록번호:   공급자,
    공급받는자등록번호: 공급받는자,
    공급자상호:      찾기("상호", 공급자),
    공급받는자상호:   찾기("상호", 공급받는자),
    공급가액:        찾기("공급가액"),
    세액:            찾기("세액"),
    품목명:          찾기("품목명"),
  };
}

function 세금계산서읽기(줄들, 머리번호, 사업장) {
  const 자리 = 세금계산서자리(줄들[머리번호].map(글자));

  return 줄들
    .slice(머리번호 + 1)
    .filter((줄) => 줄.some((칸) => 글자(칸) !== ""))
    .map((줄) => 세금계산서한줄(줄, 자리, 사업장));
}

// 매출인지 매입인지는 파일명이 아니라 등록번호로 가린다 (RULES.md).
function 세금계산서한줄(줄, 자리, 사업장) {
  const 값 = (번호) => (번호 >= 0 ? 줄[번호] : "");
  const 내번호 = 숫자만(사업장?.biz_no);

  const 매출 = Boolean(내번호) && 숫자만(값(자리.공급자등록번호)) === 내번호;
  const 매입 = Boolean(내번호) && 숫자만(값(자리.공급받는자등록번호)) === 내번호;

  const 금액   = 숫자로(값(자리.공급가액));
  const 부가세 = 숫자로(값(자리.세액));

  return {
    일자:       날짜로(값(자리.작성일자)),
    계정과목:   "",
    거래내용:   글자(값(자리.품목명)),
    거래처:     글자(매출 ? 값(자리.공급받는자상호) : 값(자리.공급자상호)),
    수입금액:   매출 ? 금액 : "",
    수입부가세: 매출 ? 부가세 : "",
    비용금액:   매입 ? 금액 : "",
    비용부가세: 매입 ? 부가세 : "",
    자산금액:   "",
    자산부가세: "",
    비고:       "세계",
    내것:       매출 || 매입,
  };
}


// ------------------------------------------------------------
// 카드 이용내역 — 전부 비용이다 (RULES.md)
// ------------------------------------------------------------

// 날짜는 접수일자와 매출일자 둘이 있다. 장부에 쓰는 것은 매출일자다.
function 카드읽기(줄들, 머리번호) {
  const 머리 = 줄들[머리번호].map(글자);
  const 자리 = {
    매출일자: 머리.indexOf("매출일자"),
    매출금액: 머리.indexOf("매출금액"),
    부가세:   머리.indexOf("부가세"),
    가맹점명: 머리.indexOf("가맹점명"),
  };

  return 줄들
    .slice(머리번호 + 1)
    // 맨 끝의 합계 줄과 빈 줄을 버린다. 매출일자가 날짜 모양인 줄만 남긴다.
    .filter((줄) => 날짜모양(줄[자리.매출일자]))
    .map((줄) => ({
      일자:       날짜로(줄[자리.매출일자]),
      계정과목:   "",
      거래내용:   "",
      거래처:     글자(줄[자리.가맹점명]),
      수입금액:   "",
      수입부가세: "",
      // 취소 거래(음수)와 원래 거래(양수)를 둘 다 넣는다. 상계하지 않는다 (RULES.md)
      비용금액:   숫자로(줄[자리.매출금액]),
      비용부가세: 숫자로(줄[자리.부가세]),
      자산금액:   "",
      자산부가세: "",
      비고:       "카드",
      내것:       true,
    }));
}


// ============================================================
// 간편장부 표 그리기 — 서식의 항목 이름을 그대로 쓴다
// ============================================================

// 기준 연도. 이 해가 아닌 줄은 표시해두고 체크를 미리 켜둔다 (RULES.md)
const 기준연도 = "2026";

const 본문열 = [
  "일자", "계정과목", "거래내용", "거래처",
  "수입금액", "수입부가세",
  "비용금액", "비용부가세",
  "자산금액", "자산부가세",
  "비고",
];

function 칸만들기(이름, 글, 속성 = {}) {
  const 칸 = document.createElement(이름);
  칸.textContent = 글;
  for (const [키, 값] of Object.entries(속성)) 칸.setAttribute(키, 값);
  return 칸;
}

function 장부그리기() {
  ledgerTable.replaceChildren();
  confirmRemove.hidden = true;
  if (장부.length === 0) return;

  const 표 = document.createElement("table");
  표.className = "장부표";

  // 머리글 두 줄 — 법정 서식과 같은 모양
  const 머리 = document.createElement("thead");

  // 머리글 첫 칸 — 글자 대신 전체 선택 체크박스를 넣는다
  const 고름머리 = 칸만들기("th", "", { rowspan: 2 });
  const 전체선택 = document.createElement("input");
  전체선택.type = "checkbox";
  전체선택.title = "전체 선택";
  전체선택.addEventListener("change", () => {
    for (const 체크 of ledgerTable.querySelectorAll("tbody input[type=checkbox]")) {
      체크.checked = 전체선택.checked;
    }
  });
  고름머리.appendChild(전체선택);

  const 윗줄 = document.createElement("tr");
  윗줄.append(
    고름머리,
    칸만들기("th", "①일자", { rowspan: 2 }),
    칸만들기("th", "②계정과목", { rowspan: 2 }),
    칸만들기("th", "③거래내용", { rowspan: 2 }),
    칸만들기("th", "④거래처", { rowspan: 2 }),
    칸만들기("th", "⑤수입(매출)", { colspan: 2 }),
    칸만들기("th", "⑥비용(원가관련 매입포함)", { colspan: 2 }),
    칸만들기("th", "⑦사업용 유형자산 및 무형자산 증감(매매)", { colspan: 2 }),
    칸만들기("th", "⑧비고", { rowspan: 2 }),
  );

  const 아랫줄 = document.createElement("tr");
  for (let 번 = 0; 번 < 3; 번 += 1) {
    아랫줄.append(칸만들기("th", "금액"), 칸만들기("th", "부가세"));
  }

  머리.append(윗줄, 아랫줄);

  const 몸 = document.createElement("tbody");
  장부.forEach((한줄, 번호) => {
    const 줄 = document.createElement("tr");

    // 기준 연도가 아닌 줄은 색깔로만 알린다. 체크는 사용자가 직접 켠다
    const 다른연도 = 한줄.일자.slice(0, 4) !== 기준연도;
    if (다른연도) 줄.className = "다른연도";

    const 고름칸 = document.createElement("td");
    const 체크 = document.createElement("input");
    체크.type = "checkbox";
    체크.dataset.번호 = 번호;
    체크.addEventListener("change", () => {
      const 전부 = [...ledgerTable.querySelectorAll("tbody input[type=checkbox]")];
      전체선택.checked = 전부.every((하나) => 하나.checked);
    });
    고름칸.appendChild(체크);
    줄.appendChild(고름칸);

    for (const 열 of 본문열) {
      const 값 = 한줄[열];
      const 칸 = 칸만들기("td", typeof 값 === "number" ? 값.toLocaleString() : 값);
      if (typeof 값 === "number") 칸.className = "숫자";
      줄.appendChild(칸);
    }
    몸.appendChild(줄);
  });

  표.append(머리, 몸);
  ledgerTable.appendChild(표);
}

// 체크한 줄을 장부에서 뺀다. 한 번 물어보고 확인을 받아야 뺀다.
// 한 번 빼면 되돌릴 수 없다.
function 체크한번호() {
  return new Set(
    [...ledgerTable.querySelectorAll("tbody input[type=checkbox]:checked")]
      .map((체크) => Number(체크.dataset.번호))
  );
}

function 묻기끝내기() {
  confirmRemove.hidden = true;
}

// 체크로 고른 뒤 '삭제' 를 눌러야 묻는 줄이 뜬다.
// 고른 것이 없으면 아무 일도 하지 않는다.
deleteBtn.addEventListener("click", () => {
  if (체크한번호().size === 0) return;
  confirmRemove.hidden = false;
});

confirmYes.addEventListener("click", () => {
  const 뺄것 = 체크한번호();
  장부 = 장부.filter((_, 번호) => !뺄것.has(번호));
  장부그리기();
  say(`${뺄것.size}건을 뺐습니다.`);
});

confirmNo.addEventListener("click", 묻기끝내기);


// ============================================================
// 처음 열었을 때 + 로그인 상태가 바뀔 때마다 화면을 다시 그린다
// (draw 가 사업장 칸을 건드리므로 반드시 파일 맨 끝에 둔다)
// ============================================================

const { data: 첫세션 } = await supabase.auth.getSession();
draw(첫세션.session);
supabase.auth.onAuthStateChange((_event, session) => draw(session));


// ============================================================
// 장부 저장 — 고른 사업장에 붙여 담는다
// 다시 저장하면 뒤에 덧붙인다. 예전 것을 지우지 않는다.
// (같은 거래가 두 번 들어가는 것을 막는 일은 다음 버전이다 — PRD 7번 7항)
// ============================================================

// 화면에 쓰는 이름을 DB 칸 이름으로 바꾼다
function 저장할줄(한줄, 사업장) {
  const 숫자나널 = (값) => (값 === "" ? null : 값);

  return {
    business_id:    사업장.id,
    entry_date:     한줄.일자,
    account:        한줄.계정과목 || null,
    description:    한줄.거래내용 || null,
    partner:        한줄.거래처 || null,
    income_amount:  숫자나널(한줄.수입금액),
    income_vat:     숫자나널(한줄.수입부가세),
    expense_amount: 숫자나널(한줄.비용금액),
    expense_vat:    숫자나널(한줄.비용부가세),
    asset_amount:   숫자나널(한줄.자산금액),
    asset_vat:      숫자나널(한줄.자산부가세),
    note:           한줄.비고 || null,
  };
}

// DB 에서 꺼낸 줄을 화면이 쓰는 이름으로 되돌린다 (저장할줄 의 반대)
function 화면줄로(줄) {
  const 숫자나빈칸 = (값) => (값 === null || 값 === undefined ? "" : Number(값));

  return {
    일자:       줄.entry_date ?? "",
    계정과목:   줄.account ?? "",
    거래내용:   줄.description ?? "",
    거래처:     줄.partner ?? "",
    수입금액:   숫자나빈칸(줄.income_amount),
    수입부가세: 숫자나빈칸(줄.income_vat),
    비용금액:   숫자나빈칸(줄.expense_amount),
    비용부가세: 숫자나빈칸(줄.expense_vat),
    자산금액:   숫자나빈칸(줄.asset_amount),
    자산부가세: 숫자나빈칸(줄.asset_vat),
    비고:       줄.note ?? "",
  };
}

// 고른 사업장에 저장해둔 장부를 오래된 날짜부터 꺼내 온다
async function 저장한장부불러오기(사업장) {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("business_id", 사업장.id)
    .order("entry_date", { ascending: true });

  if (error) {
    say(한글로(error));
    return;
  }
  장부 = (data ?? []).map(화면줄로);
}

// 장부보기 — 저장된 것만 보여준다.
// 올리기만 하고 저장하지 않은 것은 여기서 보이지 않는다.
// 보인다는 것은 저장되었다는 뜻이어야 한다.
viewLedgerBtn.addEventListener("click", async () => {
  const 사업장 = 사업장들.find((하나) => 하나.id === 고른사업장);
  if (!사업장) return;

  viewLedgerBtn.disabled = true;
  await 저장한장부불러오기(사업장);
  viewLedgerBtn.disabled = false;

  if (장부.length === 0) {
    say("저장된 장부가 없습니다.");
    return;
  }

  장부그리기();
  장부화면으로();
});

// 저장 — 그 사업장의 장부를 지금 화면에 보이는 것과 똑같이 맞춘다.
// 예전 줄을 먼저 걷어내고 화면에 있는 것을 넣는다.
// 그래서 화면에서 뺀 줄은 DB 에서도 빠지고, 같은 줄이 두 번 쌓이지 않는다.
// (장부가 비어 있으면 DB 도 비운다)
saveLedgerBtn.addEventListener("click", async () => {
  const 사업장 = 사업장들.find((하나) => 하나.id === 고른사업장);
  if (!사업장) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    say("로그인이 풀렸습니다. 다시 로그인해주세요.");
    return;
  }

  saveLedgerBtn.disabled = true;

  // 넣을 것을 먼저 만들어 둔다. 이 일이 실패하면 지우지 않는다.
  const 넣을것 = 장부.map((한줄) => 저장할줄(한줄, 사업장));

  const { error: 지움탈 } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("business_id", 사업장.id);

  if (지움탈) {
    saveLedgerBtn.disabled = false;
    say(한글로(지움탈));
    return;
  }

  if (넣을것.length > 0) {
    const { error } = await supabase.from("ledger_entries").insert(넣을것);

    if (error) {
      saveLedgerBtn.disabled = false;
      say(한글로(error));
      return;
    }
  }

  saveLedgerBtn.disabled = false;
  say(넣을것.length === 0
    ? "저장한 장부를 비웠습니다."
    : `${넣을것.length}건을 저장했습니다.`);
});
