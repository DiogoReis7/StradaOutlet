type ShiftState = {
  estado?: string | null;
  descricao?: string | null;
};

function normalizeShiftText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function shiftText(shift: ShiftState | null | undefined) {
  if (!shift) return "";
  return normalizeShiftText(`${shift.estado ?? ""} ${shift.descricao ?? ""}`);
}

export function isMedicalLeave(shift: ShiftState | null | undefined) {
  return shiftText(shift).includes("baixa");
}

/** Reunião marcada no horário: não conta para o PDS e só admin regista vendas. */
export function isMeeting(shift: ShiftState | null | undefined) {
  return shiftText(shift).includes("reuniao");
}

/** Estados do horário que impedem o registo de vendas por não-administradores. */
export function isSalesBlockedShift(shift: ShiftState | null | undefined) {
  return isMedicalLeave(shift) || isMeeting(shift);
}
