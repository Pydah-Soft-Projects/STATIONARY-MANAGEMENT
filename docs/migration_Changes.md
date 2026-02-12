Here is your requirement rewritten in proper, detailed professional English as a  **task description** :

---

### **Task: Student Data Integration from MySQL to Stationery Application**

Currently, in the Stationery module, we are storing student details in the MongoDB database. While this setup has been working fine, we now need to change the data source and fetch student information directly from the MySQL database instead of storing and syncing it in MongoDB.

The goal of this change is to eliminate the manual student syncing process and rely entirely on live data from MySQL.

I will provide the required SQL tables for reference, primarily:

* **students**
* **courses**
* **course_branches**

All stationery operations will now be performed based on these tables.

---

### **Existing Issue / Problem Statement**

We are currently facing data inconsistency due to course name changes.

For example:

* Earlier, product kits were mapped to a course named **“Degree.”**
* Several transactions were completed under this course.
* Later, the course name was changed from **“Degree” to “BSc.”**
* Even though the students remain the same, they are now shown under the updated course name ( **BSc** ).
* As a result, previous kit assignments and transactions are not appearing for these students, creating data mismatches and confusion.

---

### **Proposed Solution**

To avoid such issues in the future:

* Student details should be fetched dynamically from MySQL.
* Product mapping should be done using the **SQL Course ID** rather than the course name.
* This ensures that even if the course name changes later, the product mappings and transactions remain unaffected.
* MongoDB should not be used to store student master data going forward.

MongoDB should retain only:

* Product mapping data
* Transaction records

No student profile data should be stored there.

---

### **Immediate Implementation Requirement**

**Student Dashboard Page Update**

First, we need to update the Student Dashboard page with the following changes:

* Fetch the complete student list directly from the SQL database.
* Apply filters based on:
  * Course
  * Branch
  * Year
  * Semester

All filtering and data retrieval must happen from SQL only.

---

### **Required Table Columns to Display**

The Student Dashboard table should include:

* Student Name
* Admission Number
* PIN Number
* Course
* Student Year
* Semester
* Branch

---

### **Future Consideration**

Going forward, for any student-related data or operations, we should not depend on MongoDB. All student details must be dynamically fetched from MySQL to maintain consistency and prevent mapping or transaction disruptions due to structural or naming changes.



Table: students Columns: id int AI PK admission_number varchar(100) admission_no varchar(100) student_data text created_at timestamp updated_at timestamp dob varchar(50) adhar_no varchar(20) student_name varchar(255) email varchar(255) father_name varchar(255) student_mobile varchar(20) parent_mobile1 varchar(20) parent_mobile2 varchar(20) admission_date varchar(50) student_address text city_village varchar(100) mandal_name varchar(100) district varchar(100) batch varchar(100) college varchar(255) course varchar(100) branch varchar(100) stud_type varchar(100) student_status varchar(100) scholar_status varchar(100) caste varchar(100) gender varchar(100) remarks varchar(100) pin_no varchar(255) previous_college varchar(255) certificates_status varchar(255) student_photo longtext current_year tinyint current_semester tinyint fee_status varchar(20) registration_status varchar(20) idhi Table: courses Columns: id int AI PK college_id int name varchar(255) code varchar(50) level enum('diploma','ug','pg') total_years tinyint semesters_per_year tinyint year_semester_config json metadata json is_active tinyint(1) created_at timestamp updated_at timestamp Table: course_branches Columns: id int AI PK course_id int name varchar(255) code varchar(50) total_years tinyint semesters_per_year tinyint year_semester_config json metadata json is_active tinyint(1) created_at timestamp updated_at timestamp academic_year_id int

---

### **Implemented Changes (Migration Log)**

#### **1. Backend Infrastructure (MySQL Integration)**
*   **New Controller**: Created `sqlStudentController.js` to handle all student-related operations using the MySQL connection.
*   **Direct SQL Fetch**: Student data is now fetched directly from the `students` table in MySQL, implementing the requirements to bypass MongoDB for student profiles.
*   **Filtering**: Implemented optimized SQL queries to filter students by:
    *   Course
    *   Branch
    *   Year
    *   Semester
*   **Search**: Added search functionality across `student_name`, `admission_number`, and `student_mobile`.

#### **2. Transaction Data Migration**
*   **Schema Update**: Modified the MongoDB `Transaction` model to include a `student.sqlId` field. This serves as the permanent link between a MongoDB transaction and a MySQL student record.
*   **Migration Script**: Developed and executed `backend/scripts/migrateTransactions.js` to retroactively link existing transactions.
    *   **Matching Strategy**:
        1.  **Direct ID**: Checked if the stored ID was already a SQL ID.
        2.  **Admission Number**: Mapped MongoDB `studentId` to MySQL `admission_number` or `admission_no`.
        3.  **PIN**: Mapped MongoDB `studentId` to MySQL `pin_no`.
        4.  **Name Matching**: Used exact and fuzzy name matching as a fallback for records without clear IDs.
*   **Result**: Existing transactions are now queryable via the MySQL Student ID.

#### **3. Dynamic Allocations ("Pending" vs "Locked" Status)**
*   **The Challenge**: The "Pending Allocations" feature previously relied on a `student.items` field stored in the MongoDB `User` document. Since we moved to MySQL (which has no such field), this feature initially broke (all items showed as pending).
*   **The Solution**: Implemented **Dynamic Item Calculation** in `sqlStudentController.js`.
    *   When fetching a student profile (`getStudentById`), the system now automatically queries the MongoDB `Transaction` collection.
    *   It retrieves all **Paid** transactions linked to that student's `sqlId` (or fallback `admission_number`).
    *   It reconstructs the `student.items` map on-the-fly, allowing the frontend to correctly display items as "Locked" (Received) or "Pending" (Not yet bought) without needing to store this state in the MySQL database.

#### **4. Frontend Updates**
*   **Dashboard**: Updated to consume the new SQL-based API endpoints (`/api/sql/students`). Columns now display "Admission Number" and "PIN" correctly.
*   **Student Details**: Updated to show profile data from MySQL. The "Allocations" view now works correctly thanks to the dynamic backend logic described above.