import io,pathlib,tarfile,tempfile,unittest
import backup
from unittest.mock import patch
class ArchiveTests(unittest.TestCase):
 def test_roundtrip_and_tamper_detection(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=pathlib.Path(tmp);original=b'photo-and-database\0'*100000;(p/'source').write_bytes(original)
   backup.encrypt(p/'source',p/'archive','test-only-long-password');backup.decrypt(p/'archive',p/'restored','test-only-long-password');self.assertEqual((p/'restored').read_bytes(),original)
   data=bytearray((p/'archive').read_bytes());data[100]^=1;(p/'tampered').write_bytes(data)
   with self.assertRaises(Exception):backup.decrypt(p/'tampered',p/'bad','test-only-long-password')
   with self.assertRaises(Exception):backup.decrypt(p/'archive',p/'wrong','wrong-password')
class ExtractionTests(unittest.TestCase):
 def test_valid_archive_through_symlink_parent(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();real=root/'real';real.mkdir();alias=root/'alias';alias.symlink_to(real,target_is_directory=True);work=(alias/'work').resolve();work.mkdir();archive=root/'ok.tar'
   with tarfile.open(archive,'w') as tar:
    member=tarfile.TarInfo('manifest.json');payload=b'{}';member.size=len(payload);tar.addfile(member,io.BytesIO(payload))
   backup.extract_archive(archive,work);self.assertEqual((work/'manifest.json').read_bytes(),b'{}')
 def test_traversal_absolute_and_links_are_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();work=root/'work';work.mkdir()
   for name,kind in [('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('link',tarfile.SYMTYPE),('hardlink',tarfile.LNKTYPE)]:
    with self.subTest(name=name):
     archive=root/'bad.tar'
     with tarfile.open(archive,'w') as tar:
      member=tarfile.TarInfo(name);member.type=kind;member.linkname='../escape';tar.addfile(member)
     with self.assertRaisesRegex(RuntimeError,'Unsafe archive member'):backup.extract_archive(archive,work)
     self.assertFalse((root/'escape').exists())
class RestoreTransportTests(unittest.TestCase):
 def test_database_credentials_stay_in_environment(self):
  env,name=backup.database_environment('postgresql://operator:p%40ss%3Aword@localhost:54322/postgres?sslmode=require')
  self.assertEqual(name,'postgres');self.assertEqual(env['PGPASSWORD'],'p@ss:word');self.assertEqual(env['PGHOST'],'localhost');self.assertEqual(env['PGPORT'],'54322');self.assertEqual(env['PGSSLMODE'],'require');self.assertEqual(env['PGDATABASE'],'postgres')
  self.assertNotIn(env['PGPASSWORD'],'--dbname='+name)
 def test_provider_default_acl_is_excluded_and_app_acls_are_retained(self):
  listing='1; 826 1 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS supabase_admin\n2; 826 2 DEFAULT ACL app_private DEFAULT PRIVILEGES FOR FUNCTIONS postgres\n3; 826 3 DEFAULT ACL public DEFAULT PRIVILEGES FOR FUNCTIONS foodmap_gateway\n4; 0 0 ACL public FUNCTION gateway_me(uuid) foodmap_gateway\n'
  filtered=backup.filter_restore_list(listing)
  self.assertNotIn('supabase_admin',filtered);self.assertIn('DEFAULT ACL app_private',filtered);self.assertIn('FUNCTION gateway_me',filtered);self.assertIn('DEFAULT PRIVILEGES FOR FUNCTIONS foodmap_gateway',filtered)
class RestoreObjectTests(unittest.TestCase):
 def test_identical_existing_photo_is_verified_without_reupload(self):
  raw=b'jpeg fixture';obj={'objectKey':'fixture/full.jpg','byteSize':len(raw),'sha256':backup.digest(raw)}
  with patch.object(backup,'storage',return_value=raw) as storage:
   backup.restore_object(obj,raw);self.assertTrue(all(len(call.args)==1 for call in storage.call_args_list))
 def test_conflicting_existing_photo_is_never_overwritten(self):
  raw=b'jpeg fixture';obj={'objectKey':'fixture/full.jpg','byteSize':len(raw),'sha256':backup.digest(raw)}
  with patch.object(backup,'storage',return_value=b'different') as storage:
   with self.assertRaisesRegex(RuntimeError,'Existing restore photo mismatch'):backup.restore_object(obj,raw)
   storage.assert_called_once_with(obj['objectKey'])
if __name__=='__main__':unittest.main()
