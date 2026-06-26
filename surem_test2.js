const accessToken = "kdpotp";
const senderKey = "91b3dcb252264bd907c5045f97dc77a49a278524";
const templateCode = "scpay_01";
const reqPhone = "1833-3482".replace(/-/g, "");
const apiUrl = "https://rest.surem.com/api/v1/send/alimtalk";

const testPhone = "82-1012345678";
const text = `test`;

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
  console.log("Testing SureM API with User-Agent...");
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
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
