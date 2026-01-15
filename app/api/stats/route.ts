// Define the type explicitly
interface BirthdayWithDays {
  daysUntil: number;
  // other properties...
}

// Update sort method with explicit type parameters
const sortedArray = array.sort((a: BirthdayWithDays, b: BirthdayWithDays) => a.daysUntil - b.daysUntil);