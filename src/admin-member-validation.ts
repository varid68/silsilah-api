import { HttpException } from '@nestjs/common';

export const PAGE_SIZE = 25;

export function memberFilter(query: Record<string, unknown>) {
  const search = query.q ?? '';
  const generation = query.generation ?? null;
  const page = query.page ?? '1';
  if (typeof search !== 'string' || typeof page !== 'string' ||
      (generation !== null && typeof generation !== 'string')) {
    throw new HttpException('Pencarian atau filter tidak valid.', 400);
  }
  const q = search.trim().replace(/\s+/g, ' ');
  if (q.length > 120 || !/^[1-9]\d{0,5}$/.test(page) ||
      (generation !== null && !/^[1-9]\d{0,2}$/.test(generation))) {
    throw new HttpException('Pencarian atau filter tidak valid.', 400);
  }
  return { q, generation: generation === null ? null : Number(generation), page: Number(page) };
}

export type MemberPatch = { domicileCity?: string | null; phoneNumber?: string | null; phoneShared?: boolean };
export type Contact = { phoneNumber: string | null; phoneShared: boolean };

export function normalizePhone(input: string) {
  const compact = input.trim().replace(/[\s().-]/g, '');
  const phone = compact.startsWith('0') ? '+62' + compact.slice(1)
    : compact.startsWith('62') ? '+' + compact : compact;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new HttpException('Masukkan nomor HP yang valid, misalnya 081234567890.', 400);
  }
  return phone;
}

export function parsePatch(body: unknown): MemberPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpException('Data perubahan tidak valid.', 400);
  }
  const fields = body as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (!keys.length || keys.some(key => !['domicileCity', 'phoneNumber', 'phoneShared'].includes(key))) {
    throw new HttpException('Hanya domisili, nomor HP, dan izin berbagi yang dapat diubah.', 400);
  }
  const patch: MemberPatch = {};
  if ('domicileCity' in fields) {
    const city = fields.domicileCity;
    if (city !== null && (typeof city !== 'string' || city.trim() !== city || !city || city.length > 100)) {
      throw new HttpException('Domisili tidak valid.', 400);
    }
    patch.domicileCity = city;
  }
  if ('phoneNumber' in fields) {
    const phone = fields.phoneNumber;
    if (phone !== null && (typeof phone !== 'string' || phone.length > 50)) {
      throw new HttpException('Nomor HP tidak valid.', 400);
    }
    patch.phoneNumber = phone?.trim() ? normalizePhone(phone) : null;
  }
  if ('phoneShared' in fields) {
    if (typeof fields.phoneShared !== 'boolean') throw new HttpException('Izin berbagi tidak valid.', 400);
    patch.phoneShared = fields.phoneShared;
  }
  return patch;
}

export function applyContactPatch(current: Contact, patch: MemberPatch): Contact {
  const phoneNumber = patch.phoneNumber === undefined ? current.phoneNumber : patch.phoneNumber;
  if (!phoneNumber && patch.phoneShared === true) {
    throw new HttpException('Isi nomor HP sebelum mengaktifkan izin berbagi.', 400);
  }
  const phoneShared = !!phoneNumber && (patch.phoneShared ??
    (phoneNumber === current.phoneNumber && current.phoneShared));
  return { phoneNumber, phoneShared };
}
