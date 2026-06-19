export type GroupReadReceiptPresentation = {
  messageId: string;
  readCount: number;
  label: string;
  readerLabels: string[];
};

const MAX_NAME_PREVIEW = 3;

export function presentGroupReadReceipt(input: {
  messageId: string;
  readCount: number;
  readerLabels: string[];
}): GroupReadReceiptPresentation {
  const readCount = Math.max(0, input.readCount);
  const names = input.readerLabels.filter(Boolean).slice(0, MAX_NAME_PREVIEW);
  let label = "";
  if (readCount <= 0) {
    label = "";
  } else if (names.length === 0) {
    label = `읽음 ${readCount}`;
  } else if (readCount <= names.length) {
    label = `${names.join(" ")} 읽음`;
  } else {
    label = `${names.join(" ")} 외 ${readCount - names.length}명 읽음`;
  }
  return {
    messageId: input.messageId,
    readCount,
    label,
    readerLabels: names,
  };
}

export function shouldShowGroupReadReceipt(readCount: number, isMine: boolean): boolean {
  return isMine && readCount > 0;
}
