/**
 * background.js — 서비스 워커
 *
 * 이 확장은 모든 변환을 사이드패널(브라우저) 안에서 처리한다.
 * 서버·외부 API·AI를 사용하지 않으므로 백그라운드는 사이드패널을 여는 역할만 한다.
 */

// 툴바 아이콘 클릭 → 사이드패널 열기
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
