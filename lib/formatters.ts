export function getOrdinal(day: number) {
  if (day > 3 && day < 21) return "th";

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatDateLong(dateString: string | null | undefined) {
  if (!dateString) return "";

  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;

  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);

  const date = new Date(year, month, day);
  const monthName = date.toLocaleString("en-GB", { month: "long" });

  return `${day}${getOrdinal(day)} ${monthName} ${year}`;
}