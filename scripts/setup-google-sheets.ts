import { sheetsStore } from "../lib/sheets/store";

async function main() {
  await sheetsStore.initialize();
  console.log("Google Sheets 탭과 헤더 초기화가 완료되었습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
