import { differenceInMonths, differenceInDays, differenceInWeeks, parseISO, isAfter } from "date-fns";

export const calculateDurationInMonths = (startDate: string, endDate: string | null): number => {
  if (!endDate) {
    const months = differenceInMonths(new Date(), parseISO(startDate));
    return Math.max(1, months); // At least 1 month for active rentals
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // Calculate months difference
  const months = differenceInMonths(end, start);

  // If less than 1 month, calculate based on days (round up)
  if (months === 0) {
    const days = differenceInDays(end, start);
    return Math.max(1, Math.ceil(days / 30)); // Round up partial months
  }

  return months;
};

export const calculateDuration = (startDate: string, endDate: string | null, periodType: string = 'Monthly'): number => {
  if (!endDate) {
    // For active rentals, calculate duration from start to now
    const start = parseISO(startDate);
    const now = new Date();

    switch (periodType) {
      case 'Daily':
        return Math.max(1, differenceInDays(now, start));
      case 'Weekly':
        return Math.max(1, differenceInWeeks(now, start));
      case 'Monthly':
      default:
        return Math.max(1, differenceInMonths(now, start));
    }
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  switch (periodType) {
    case 'Daily':
      return Math.max(1, differenceInDays(end, start));
    case 'Weekly':
      return Math.max(1, differenceInWeeks(end, start));
    case 'Monthly':
    default:
      return Math.max(1, differenceInMonths(end, start));
  }
};

export const formatDuration = (months: number, periodType: string = 'Monthly'): string => {
  if (months === 0) {
    switch (periodType) {
      case 'Daily':
        return "0 days";
      case 'Weekly':
        return "0 weeks";
      default:
        return "0 mo";
    }
  }

  switch (periodType) {
    case 'Daily':
      return `${months} ${months === 1 ? 'day' : 'days'}`;
    case 'Weekly':
      return `${months} ${months === 1 ? 'week' : 'weeks'}`;
    case 'Monthly':
    default:
      return `${months} mo`;
  }
};

export const getRentalStatus = (startDate: string, endDate: string | null, status: string): string => {
  const today = new Date();
  const start = parseISO(startDate);
  
  if (isAfter(start, today)) {
    return "Upcoming";
  }
  
  return status || "Active";
};

export const getDurationFilter = (months: number): string => {
  if (months <= 12) return "≤12 mo";
  if (months <= 24) return "13–24 mo";
  return ">24 mo";
};