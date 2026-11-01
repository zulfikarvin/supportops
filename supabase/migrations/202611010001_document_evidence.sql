-- Extend proof uploads without changing visibility, organization policies, or size limits.
alter table public.ticket_attachments drop constraint ticket_attachments_content_type_check;
alter table public.ticket_attachments add constraint ticket_attachments_content_type_check
 check (content_type in ('image/png','image/jpeg','text/plain','text/csv','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

update storage.buckets set allowed_mime_types = array[
 'image/png','image/jpeg','text/plain','text/csv','application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] where id = 'ticket-evidence';
