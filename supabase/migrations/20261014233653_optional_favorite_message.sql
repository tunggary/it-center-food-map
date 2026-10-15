-- Keep the string contract and defensive byte limit; an introduction may be empty.
alter table app_private.favorites
  drop constraint favorites_message_check,
  add constraint favorites_message_check check (octet_length(message) <= 8192);
