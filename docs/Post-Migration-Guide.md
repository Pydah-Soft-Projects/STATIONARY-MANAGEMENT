# Post-Migration Guide: Student & Transaction System

This guide outlines the changes made during the migration from the legacy MongoDB `User` model to the new MySQL-based Student System. It highlights critical edge cases to monitor and provides steps for verification.

## 1. Executive Summary of Changes

* **Student Data** : Now sourced entirely from **MySQL** (`students` table). The MongoDB `users` collection is deprecated for student data.
* **Course/Branch Data** : Now sourced from **MySQL** (`courses`, `course_branches` tables). The MongoDB `academicconfigs` collection is deprecated.
* **Transactions** :
* **Linking** : Transactions now link to students via `student.sqlId` (MySQL ID).
* **Status** : `student.userId` is `null` for new transactions.
* **Dynamic Items** : Student "Item Status" (Pending vs Issued) is no longer stored in the student record. It is calculated **dynamically** by aggregating the student's entire transaction history on-the-fly.
* **Frontend** : All student-related pages (

  StudentDashboard,

  StudentManagement,

  AddProduct,

  CourseManagement) now fetch data from SQL API endpoints.

## 2. Critical Edge Cases & Watchlist

WARNING

**1. Mismatched Historical Transactions**

* **Issue** : Use the

  migrateTransactions.js script to link old transactions. If a student's name in MongoDB (Transaction) doesn't *exactly* match their name/details in MySQL, the transaction might not link to them.

* **Symptom** : A student claims they paid/received items, but their "Student Details" page shows everything as "Pending".
* **Fix** : Manually update the

  Transaction document in MongoDB. Set `student.sqlId` to the correct MySQL ID for that student.

IMPORTANT

**2. Course/Branch Name Mismatches**

* **Issue** : The system relies on string matching for Course/Branch names between MySQL (Source of Truth) and MongoDB (Products/History).
* **Symptom** : A student in "B.Tech" (MySQL) might not see products configured for "B.Tech." (MongoDB - note the dot).
* **Fix** : Ensure Product configurations in

  AddProduct use the exact names from MySQL. Renaming a course in MySQL might break product visibility until products are updated.

CAUTION

**3. Performance on Large Histories**

* **Issue** : Calculating "Pending Items" requires fetching *all* past transactions for a student.
* **Symptom** : The "Student Details" page might load slowly for a final-year student with 50+ transactions.
* **Mitigation** : The current implementation is optimized, but monitor load times. Indexing `student.sqlId` in MongoDB is crucial.

NOTE

**4. Receipt Headers**

* **Issue** : Receipt headers are now fetched from MySQL `courses` table (checking `metadata` column).
* **Symptom** : Receipts show default/fallback headers instead of course-specific ones.
* **Fix** : Ensure the `metadata` JSON column in MySQL `courses` table has `receipt_header` and `receipt_subheader`.

## 3. Verification Steps

### A. New Student Journey

1. **Search** : Go to "Student Management". Search for a student by Name or Admission No. Verify they appear.
2. **Profile** : Click the student. Verify "Admission No" and "PIN" are correct (sourced from SQL).
3. **Items** : Verify "Pending Items" list is populated based on their Course/Year.

### B. Transaction Flow

1. **Create** : Go to "Fee Collection" / "Issue Items". Select a student.
2. **Issue** : Add an item to the cart and checkout (Cash/Online).
3. **Verify** :

* Go back to the Student's Profile.
* **Immediate Check** : The item should now be in the "Issued/Locked" list, NOT "Pending".
* **Stock** : Verify the stock for that item (and its components if a set) decreased.

### C. Historical Data

1. **Check Old Student** : Find a student who had transactions *before* today.
2. **Verify History** : Ensure their past transactions appear in the "History" tab.
3. **Verify Status** : Ensure items they previously bought are marked as "Issued".

## 4. Rollback / Emergency Fixes

If you encounter critical data issues:

1. **Missing Transactions** : Use MongoDB Compass to find the orphaned transaction. Update `student.sqlId` to match the student's MySQL ID.
2. **Wrong Course Config** : If Course mapping is broken, check

   sqlAcademicController.js and ensure the MySQL query returns the expected

   name format.

## 5. Developer Notes

* **No User Model** : Do not attempt to `import User` or use `User.findById`. It does not exist for students anymore.
* **No AcademicConfig** : Use `sqlAcademicController` or `settingsController` (which now queries MySQL) for academic data.

**Comment**Ctrl+Alt+M
