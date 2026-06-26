const accessToken = "kdpotp";
const senderKey = "91b3dcb252264bd907c5045f97dc77a49a278524";
const templateCode = "scpay_01";
const reqPhone = "1833-3482".replace(/-/g, "");
const apiUrl = "https://rest.surem.com/api/v1/send/alimtalk";

const testPhone = "82-1012345678";
const text = `[브이디로보틱스] 결제 완료 안내
테스트님, 주문하신 상품의 결제가 정상적으로 완료되었습니다.
■ 결제 내역
 - 상품명 : 테스트상품
 - 수량 : 1개
 - 총 결제금액 : 100원
로봇 설치 일정을 잡기 위해 담당 부서에서 영업일 기준 1~2일 내로 해피콜을 드릴 예정입니다.
고맙습니다.`;

const requestBody = {
  bizType: "at",
  senderKey,
  templateCode,
  to: testPhone,
  text,
  reqPhone,
  reSend: "N",
};

async function test() {
  console.log("Testing SureM API...");
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseText = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", responseText);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
