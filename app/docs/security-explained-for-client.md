# Kịch bản trình bày: "Phần mềm Phòng Kinh Tế bảo mật như thế nào?"

> **Đối tượng:** Lãnh đạo + cán bộ phòng, **không chuyên CNTT**
> **Thời lượng:** 15-20 phút
> **Mục tiêu:** Khách hàng hiểu được phần mềm an toàn ở **mức nào**, **vì sao** an toàn, **thực tế ra sao**

---

## 🎯 Mở đầu (1 phút)

> *"Trước khi đi vào tính năng, em xin trình bày phần quan trọng nhất với một cơ quan hành chính công như Phòng Kinh Tế: **bảo mật**. Vì phần mềm này không chỉ lưu lịch họp, nhiệm vụ phòng - mà còn lưu:*
> - *Thông tin công dân (tên, số điện thoại, địa chỉ) trong hồ sơ TTHC*
> - *Nội dung khiếu nại của dân qua iHanoi - cực kỳ nhạy cảm*
> - *Văn bản chỉ đạo UBND xã giao*
> - *Lời nhắn nội bộ giữa lãnh đạo*
>
> *Theo Nghị định 13/2023 về Bảo vệ dữ liệu cá nhân, nếu để lộ những thứ này, cơ quan có thể bị xử phạt nặng. Vì vậy bảo mật là **ưu tiên số 1**."*

---

## 🏛️ Phần 1: Hình dung phần mềm như một tòa nhà công sở (2 phút)

> *"Để dễ hình dung, các anh chị hãy tưởng tượng phần mềm này như **một tòa nhà công sở**:*
>
> - **Cửa chính** = trang đăng nhập
> - **Phòng làm việc** = các trang nhiệm vụ, báo cáo
> - **Kho lưu trữ tầng hầm** = cơ sở dữ liệu chứa toàn bộ thông tin
> - **Tủ hồ sơ trong kho** = các bảng dữ liệu chứa hồ sơ TTHC, khiếu nại iHanoi, lời nhắn TP
>
> *Một tòa nhà công sở thật ngoài đời có gì? - Cửa khóa, bảo vệ, camera, két sắt, hồ sơ tuyệt mật được niêm phong, sổ ghi ai vào ai ra... Phần mềm của chúng ta cũng có **6 lớp bảo vệ tương tự**, mỗi lớp 1 nhiệm vụ riêng."*

---

## 🔐 Phần 2: 6 lớp bảo vệ — đi sâu từng lớp (10 phút)

### Lớp 1: Cửa chính có khóa thông minh (Mật khẩu)

> *"Lớp đầu tiên là **mật khẩu** - giống khóa cửa chính tòa nhà. Nhưng đây không phải khóa cửa thường, mà là **khóa thông minh** với 3 tính năng:*
>
> **1. Khóa không thể bẻ:**
> *Hacker không thể đoán mật khẩu bằng cách thử lần lượt. Vì sao? - Vì mật khẩu được mã hóa bằng công nghệ **Argon2id** (đoạt giải quốc tế năm 2015 về thuật toán mật khẩu mạnh nhất).*
>
> *Để dễ hình dung: Hacker dùng máy tính siêu mạnh đoán 1 tỷ mật khẩu/giây. Với mật khẩu 12 ký tự đầy đủ chữ-số-ký tự, hacker cần khoảng **3 nghìn năm** mới đoán ra 1 mật khẩu."*
>
> **2. Tự động khóa cửa sau khi thử sai nhiều lần:**
> - *Sai 5 lần liên tục → khóa tài khoản 15 phút*
> - *Sai 10 lần trong 1 giờ → khóa cho đến khi admin mở*
> - *1 địa chỉ IP sai 20 lần → chặn IP đó 24h*
>
> *Giống như cửa ATM - sai 3 lần là nuốt thẻ. Hacker không thể "thử mãi" được.*
>
> **3. Bắt đặt mật khẩu mạnh:**
> - *Tối thiểu **12 ký tự** (mật khẩu phổ thông chỉ 6-8 ký tự)*
> - *Phải có 3 trong 4: chữ HOA, chữ thường, số, ký tự đặc biệt*
> - *KHÔNG được trùng tên/email của mình*
> - *KHÔNG được dùng mật khẩu phổ biến (password, 123456...)*
> - *KHÔNG được trùng 5 mật khẩu cũ*

---

### Lớp 2: Chìa khóa đôi - bắt buộc với lãnh đạo (Xác thực 2 yếu tố / 2FA)

> *"Lớp 2 là **2FA** - viết tắt của 'xác thực 2 yếu tố'. Đây là phần các anh chị TP / PTP / Trưởng bộ phận **BẮT BUỘC PHẢI BẬT**.*
>
> *Hình dung như **rút tiền ATM**: Không chỉ cần thẻ (mật khẩu) mà còn cần mã PIN. Mất thẻ thôi không đủ.*
>
> **Cách hoạt động:**
> 1. *Anh chị đăng nhập mật khẩu bình thường*
> 2. *Phần mềm hỏi tiếp: 'Mã 6 số trên app Google Authenticator'*
> 3. *Anh chị mở app trên điện thoại → đọc mã 6 số → nhập vào*
> 4. *Mã này đổi mỗi 30 giây - hacker biết mật khẩu nhưng không có điện thoại của anh chị thì không vào được*
>
> **Tình huống thật:** *Giả sử kẻ xấu lấy được sổ ghi mật khẩu của Trưởng phòng (đánh rơi, lén nhìn...) - **vẫn không vào được** vì còn cần điện thoại Trưởng phòng. Đây là lý do nhiều ngân hàng, cổng dịch vụ công đã bắt buộc 2FA cho tài khoản quan trọng."*
>
> **Phòng trường hợp mất điện thoại:**
> *Khi bật 2FA, phần mềm cấp **8 mã backup** dùng 1 lần. In ra, cất két. Mất điện thoại → dùng 1 mã backup vào lại được.*

---

### Lớp 3: Camera an ninh + sổ ghi ra vào (Theo dõi thiết bị & lịch sử đăng nhập)

> *"Lớp 3 là **giám sát**. Phần mềm như một tòa nhà có camera + sổ bảo vệ ghi rõ ai ra ai vào, lúc mấy giờ, từ đâu.*
>
> **Mỗi lần đăng nhập, phần mềm ghi lại:**
> - *Đăng nhập thành công hay thất bại*
> - *Thời gian, địa chỉ IP, thiết bị (Chrome/Firefox/iPhone...)*
> - *Tỉnh/thành phố ước tính (dựa trên IP)*
>
> **Phát hiện bất thường - tự động cảnh báo:**
> - *Đăng nhập từ **thiết bị mới** chưa từng dùng → email cảnh báo "Có người vừa đăng nhập tài khoản của bạn từ Chrome trên Windows tại IP xxx. Nếu không phải bạn, vui lòng đổi mật khẩu ngay"*
> - *Đăng nhập từ **2 nơi xa nhau trong <1 tiếng** (vd Hà Nội rồi TP.HCM) → cảnh báo cấp cao "Di chuyển bất khả thi"*
> - *Đăng nhập **ngoài giờ làm việc** (22h-6h sáng) lần đầu → cảnh báo*
>
> **Ví dụ thật:** *Giả sử tài khoản TP bị hack ở TP.HCM. Trong 30 phút sau khi TP đăng nhập ở văn phòng Hà Nội, hệ thống lập tức gửi email cho TP biết và đánh dấu nguy hiểm cấp cao. TP có thể vào ngay /settings/security để 'thu hồi quyền' của thiết bị lạ - lập tức kẻ kia bị đá ra.*"

**📱 Demo gợi ý:** Mở `/settings/security` để khách hàng xem danh sách thiết bị + lịch sử đăng nhập 30 ngày.

---

### Lớp 4: Két sắt mật mã - LỚP BẢO VỆ CỐT LÕI (Mã hóa dữ liệu)

> *"Lớp 4 là lớp em muốn nhấn mạnh nhất, vì đây là khác biệt lớn so với các phần mềm thông thường.*
>
> **Vấn đề:** *Phần mềm thông thường lưu dữ liệu trong cơ sở dữ liệu dạng **đọc được thẳng**. Nếu hacker đột nhập server, hay nhân viên IT có quyền database, họ mở file DB ra là đọc được:*
> ```
> Citizen name: Nguyễn Văn A
> Phone: 0912345678
> Content: Khiếu nại đất đai sai phép...
> ```
>
> **Phần mềm của chúng ta KHÁC:** *Dữ liệu nhạy cảm được **mã hóa từng ô** trước khi lưu. Hacker đột nhập DB chỉ thấy:*
> ```
> Citizen name: enc:AcKaXH1K4WIkjl4mITCERHWXVA4kXI7YXHiq5BHyln4...
> Phone: enc:ARV5368bdUdvbSXn29P9uKVBeZ...
> Content: enc:AQ/On7J+ypn2ff0NP8gsfXDJWH6BfK5VV2cGUS5yG1Aka5...
> ```
>
> *Đây là **ký tự ngẫu nhiên không có ý nghĩa** đối với người không có chìa khóa.*
>
> **Hình dung như két sắt:**
> - *Mỗi ô dữ liệu được khóa trong **két sắt mini riêng***
> - *Chìa khóa **KHÔNG nằm trong DB**, mà ở **file riêng trên server**, chỉ phần mềm đọc được*
> - *Chỉ phần mềm có chìa khóa mới giải mã ra được tiếng Việt đọc được*
>
> *Đây là tiêu chuẩn **AES-256-GCM** - đang dùng bởi quân đội Mỹ, ngân hàng SWIFT, máy chủ chính phủ. Để dễ hình dung: Với máy tính nhanh nhất hiện nay, để bẻ khóa mã hóa này cần khoảng **10²² năm** (con số dài hơn tuổi vũ trụ).*"

**📊 Số liệu thực tế từ DB hiện tại:**
- *Hơn **100 hồ sơ TTHC + iHanoi** đã được mã hóa*
- *Toàn bộ lời nhắn nội bộ giữa lãnh đạo đã mã hóa*
- *Lịch sử trao đổi với trợ lý AI đã mã hóa*

> *"Một số loại dữ liệu còn cần **tìm kiếm được**, ví dụ tìm 'hồ sơ của ông Nguyễn Văn B'. Bình thường muốn search thì phải mở khóa hết hồ sơ ra - mất an toàn. Chúng tôi dùng kỹ thuật **'blind index'** (chỉ mục mù): Ghi thêm 1 'mã vạch ẩn' của tên - cho phép tìm chính xác mà không cần mở khóa toàn bộ. Giống như sổ tay có mục lục mà không lộ nội dung."*

---

### Lớp 5: Tường rào - máy chủ kiên cố (Server hardening)

> *"Lớp 5 là **bảo vệ phía máy chủ** - tức **đĩa cứng vật lý** chứa toàn bộ dữ liệu.*
>
> **Mã hóa ổ đĩa (LUKS):**
> *Toàn bộ ổ cứng máy chủ được mã hóa. Nếu kẻ xấu xông vào trung tâm dữ liệu, tháo ổ cứng mang về nhà cắm vào máy khác → vẫn không đọc được, ổ cứng chỉ là cục sắt vô dụng. Tương tự ổ cứng laptop có BitLocker.*
>
> **Đường truyền mã hóa (HTTPS / TLS 1.3):**
> *Mọi dữ liệu trao đổi giữa trình duyệt anh chị và máy chủ đều mã hóa. Hacker nghe lén Wifi cafe / mạng công ty cũng không đọc được. Đây là tiêu chuẩn TLS 1.3 (mới nhất 2018).*
>
> **Quyền truy cập tối thiểu:**
> *Phần mềm chạy với tài khoản 'loha' - không phải root. Nếu có lỗ hổng cũng không phá được toàn hệ thống. Quyền truy cập file là **chỉ đọc** ở thư mục quan trọng.*
>
> **Tường lửa + giới hạn quốc gia:**
> *Chặn truy cập từ ngoài Việt Nam (nếu cần). Chỉ mở 3 cổng: SSH quản trị (đổi port), HTTP, HTTPS. Mọi cổng khác đóng.*
>
> **Chống tấn công DDoS:**
> *Giới hạn số lần truy cập từ 1 IP: tối đa 10 lần đăng nhập/phút, 60 request API/phút. Hacker không thể spam được."*

---

### Lớp 6: Bản sao trong két công an (Sao lưu mã hóa)

> *"Lớp cuối cùng - dự phòng thảm họa.*
>
> *Mỗi đêm 2 giờ sáng, hệ thống tự động:*
> 1. *Sao lưu toàn bộ cơ sở dữ liệu*
> 2. *Mã hóa file backup bằng **GPG** (một lớp mã hóa khác)*
> 3. *Gửi sang **máy chủ backup riêng** đặt tại văn phòng phòng (Windows server local)*
> 4. *Giữ lại 30 ngày, tự xóa file cũ hơn*
>
> **Tình huống nào xảy ra cũng có dự phòng:**
> - *Server chính cháy / hỏng → restore từ backup*
> - *Bị virus ransomware mã hóa toàn bộ → backup mới hôm qua vẫn còn*
> - *Nhân viên xóa nhầm dữ liệu → restore record*
> - *Hacker xóa data để tống tiền → backup vẫn an toàn (máy khác, mạng riêng)*
>
> *File backup nếu bị copy ra ngoài cũng **không decrypt được** nếu thiếu chìa khóa GPG riêng. Chìa khóa này được:*
> - *In ra giấy, cất 2 két sắt: phòng TP + phòng PTP*
> - *Backup USB encrypted cất riêng*
>
> **Mất chìa khóa = không restore được.** *Vì vậy quy trình lưu giữ chìa khóa rất nghiêm ngặt - giống két công an gửi vàng."*

---

## 🎬 Phần 3: Kịch bản tấn công thực tế (3 phút)

> *"Bây giờ em mô phỏng **3 kịch bản tấn công** để các anh chị thấy bảo mật hoạt động ra sao."*

### Kịch bản 1: Hacker đoán mật khẩu

```
[10:00] Hacker thử mật khẩu "123456" → SAI
[10:01] Thử "password" → SAI
[10:02] Thử "tranphu2026" → SAI
[10:03] Thử "kinhte123" → SAI
[10:04] Thử "abc12345" → SAI

🛑 Tài khoản tự khóa 15 phút
📧 Email gửi đến chủ tài khoản: "Phát hiện 5 lần đăng nhập sai từ IP xxx.
   Tài khoản đã bị khóa. Nếu không phải bạn, đổi mật khẩu ngay."
```
> **Kết quả: Hacker không vào được, chủ tài khoản biết ngay.**

### Kịch bản 2: Hacker biết mật khẩu (do phishing / nhìn trộm)

```
[14:00] Hacker đăng nhập với mật khẩu đúng → MẬT KHẨU OK ✓
[14:00] Hệ thống: "Vui lòng nhập mã 6 số từ app Authenticator"
[14:01] Hacker: không có điện thoại của TP → KHÔNG NHẬP ĐƯỢC
[14:02] Hacker thử đoán mã → SAI
[14:03] Hệ thống: ghi "2FA fail" + email cảnh báo cho TP

📧 Email tới TP: "Có người vừa đăng nhập đúng mật khẩu nhưng KHÔNG có
   mã 2FA. IP xxx. Có thể mật khẩu của bạn bị lộ - vui lòng đổi ngay."
```
> **Kết quả: Hacker bị chặn ở lớp 2. TP biết phải đổi mật khẩu.**

### Kịch bản 3: Hacker đột nhập server (kịch bản tệ nhất)

```
[03:00] Hacker khai thác lỗ hổng → vào được server
[03:01] Hacker copy toàn bộ database file
[03:30] Hacker mở file DB ra đọc...

   citizens.content   = "enc:AQ/On7J+ypn2ff0NP8gsfXDJWH6BfK5VV2cGUS5..."
   citizens.phone     = "enc:ARV5368bdUdvbSXn29P9uKVBeZ..."
   task_notes.content = "enc:AbsZtMPL8jKxKGQZmvdFgTFAFV6DeWAu2I9..."

→ Không đọc được gì có nghĩa.

[03:32] Hacker tìm chìa khóa giải mã trong DB → KHÔNG CÓ (chìa khóa ở file ngoài)
[03:35] Hacker tìm chìa khóa trong file server → bị mã hóa bằng LUKS
[03:40] Hacker thử brute force chìa khóa AES-256 → cần 10²² năm
```
> **Kết quả: Server bị đột nhập nhưng dữ liệu **không bị lộ**. Vì 4 lớp mã hóa độc lập, hacker cần phá hết mới đọc được.**

---

## 📋 Phần 4: So sánh với phần mềm thông thường (2 phút)

> *"Để các anh chị có thước đo, em xin so sánh."*

| Tính năng | Phần mềm phòng | Phần mềm thường |
|---|---|---|
| Mã hóa mật khẩu | **Argon2id 2024** | MD5 / SHA1 (đã bị phá) |
| Xác thực 2 yếu tố | **Bắt buộc cho lãnh đạo** | Không có |
| Khóa tài khoản brute-force | **Tự động + email** | Không có |
| Mã hóa dữ liệu trong DB | **Từng ô, AES-256** | Plaintext (đọc thẳng) |
| Theo dõi thiết bị đăng nhập | **Đầy đủ + cảnh báo** | Không có |
| Sao lưu mã hóa | **GPG + Windows local** | Backup plaintext |
| Đăng xuất tự động | **8h + idle 30 phút** | Không giới hạn |
| Phát hiện đăng nhập 2 nơi | **Có + cảnh báo email** | Không có |

> *"Phần mềm của chúng ta vượt **chuẩn Thông tư 23/2023/TT-BTTTT** về bảo mật cấp độ 2-3 (cấp độ áp dụng cho hệ thống thông tin của UBND xã/phường có xử lý dữ liệu công dân)."*

---

## ❓ Phần 5: Câu hỏi thường gặp (3 phút)

### Q1: "Lỡ tôi quên mật khẩu thì sao?"

> *"Liên hệ Trưởng phòng / Quản trị hệ thống. Họ vào trang admin, ấn 'Reset mật khẩu' → hệ thống sinh mật khẩu tạm gửi cho anh chị. Lần đăng nhập đầu **bắt buộc anh chị đổi sang mật khẩu riêng** - quản trị viên cũng không biết mật khẩu mới của anh chị."*

### Q2: "Lỡ tôi mất điện thoại có 2FA?"

> *"Dùng 1 trong 8 mã backup đã in ra trước đó. Mỗi mã dùng 1 lần. Sau khi vào lại được, anh chị tự sinh lại bộ mã mới + đăng ký 2FA trên điện thoại mới."*

### Q3: "Cài app Authenticator nào? Có tốn phí không?"

> *"Google Authenticator (miễn phí, có sẵn trên Android/iOS), Microsoft Authenticator (miễn phí), Authy (miễn phí). Em khuyến nghị Microsoft Authenticator vì có backup cloud, đổi máy không mất secret."*

### Q4: "Tôi truy cập từ điện thoại có an toàn không?"

> *"Có. Mã hóa đường truyền HTTPS hoạt động trên cả mobile. Tuy nhiên em khuyến nghị **không dùng Wifi công cộng** (cafe, sân bay) cho công việc nhạy cảm - nguy cơ phishing cao. Dùng 4G/5G hoặc Wifi cơ quan an toàn hơn."*

### Q5: "Nếu công ty cung cấp phần mềm phá sản / không hỗ trợ nữa thì sao?"

> *"Toàn bộ dữ liệu + chìa khóa giải mã ở phía cơ quan. Code phần mềm là open source nội bộ, có thể chuyển sang đội kỹ thuật khác bảo trì tiếp."*

### Q6: "Chi phí bảo mật cao thế này, có cần thiết không khi phòng chỉ 21 người?"

> *"Cần thiết vì:*
> - *Phòng xử lý dữ liệu công dân (TTHC, iHanoi) - Nghị định 13/2023 bắt buộc bảo vệ.*
> - *Một lần lộ dữ liệu công dân có thể bị xử phạt + uy tín cơ quan ảnh hưởng nặng.*
> - *Hacker không quan tâm phòng to hay nhỏ, họ scan internet tự động.*
> - *21 người = 21 tài khoản = 21 cánh cửa. Chỉ cần 1 tài khoản bị hack là toàn bộ dữ liệu phòng có nguy cơ."*

### Q7: "Có ai kiểm chứng bảo mật chưa? Hay chỉ tự nói?"

> *"Sau khi triển khai, có thể:*
> 1. *Test SSL/TLS qua **ssllabs.com** - mong đợi rating A+*
> 2. *Test header bảo mật qua **securityheaders.com** - mong đợi A*
> 3. *Thuê 1 đơn vị độc lập (Viettel CS, FPT IS, BKAV) làm **pen-test** (đánh giá xâm nhập) trước khi đưa vào sử dụng chính thức*
> 4. *Định kỳ 12 tháng/lần đổi toàn bộ chìa khóa mã hóa.*"

---

## 🎁 Phần 6: Đóng - cam kết & trách nhiệm (1 phút)

> *"Em xin tổng kết bằng cam kết:*
>
> **Phần mềm cam kết:**
> ✅ *Tuân thủ Luật An toàn thông tin mạng 2015*
> ✅ *Tuân thủ Nghị định 13/2023 về bảo vệ dữ liệu cá nhân*
> ✅ *Tuân thủ Thông tư 23/2023/TT-BTTTT cấp độ 2-3*
> ✅ *Mọi sự kiện bảo mật đều có ghi nhật ký, không thể xóa âm thầm*
> ✅ *Mọi lớp bảo vệ có thể được kiểm chứng độc lập*
>
> **Trách nhiệm của người dùng (xin các anh chị lưu ý):**
> 🔑 *KHÔNG chia sẻ mật khẩu cho bất kỳ ai (kể cả IT)*
> 🔑 *Đặt mật khẩu mạnh, đổi sau khi nhận từ admin*
> 🔑 *Bật 2FA ngay khi được yêu cầu (bắt buộc với TP/PTP/TBP)*
> 🔑 *Lưu 8 mã backup vào nơi an toàn (in ra cất két, KHÔNG lưu file trên máy)*
> 🔑 *Đăng xuất khi rời máy*
> 🔑 *Nếu nhận email cảnh báo "thiết bị mới" mà không phải bạn → đổi mật khẩu ngay*
>
> *"Bảo mật là **trách nhiệm chung** - phần mềm lo 90%, người dùng lo 10%. 10% này quyết định hệ thống có thực sự an toàn hay không. Cảm ơn các anh chị đã lắng nghe."*

---

## 📌 Phụ lục: Slide gợi ý (nếu cần in / chiếu)

### Slide 1 - Title
> **"Phần mềm Phòng Kinh Tế: 6 lớp bảo vệ dữ liệu công vụ"**
> *Trình bày: [Tên người trình bày]*

### Slide 2 - Tại sao cần bảo mật?
> - Dữ liệu công dân (TTHC, iHanoi)
> - Lời nhắn nội bộ TP/PTP
> - Văn bản chỉ đạo UBND
> - Nghị định 13/2023: bắt buộc bảo vệ

### Slide 3 - 6 lớp bảo vệ (1 slide tóm tắt)
> 1. 🔐 Mật khẩu Argon2id + chống brute-force
> 2. 📱 2FA bắt buộc cho lãnh đạo
> 3. 📹 Camera + nhật ký + cảnh báo
> 4. 🗄️ Két sắt AES-256 - lớp cốt lõi
> 5. 🛡️ Server kiên cố + mã hóa ổ cứng
> 6. 💾 Backup mã hóa sang Windows local

### Slide 4-9 - Đi sâu từng lớp (1 slide/lớp với metaphor + key point)

### Slide 10 - Demo
> - `/login` → thử sai 5 lần → khóa
> - `/settings/security` → bật 2FA
> - `/settings/security` → xem thiết bị + lịch sử

### Slide 11 - Kịch bản tấn công
> 3 case như phần 3 ở trên

### Slide 12 - So sánh chuẩn
> Bảng so sánh phần mềm phòng vs phần mềm thường

### Slide 13 - Cam kết
> - Tuân thủ luật VN
> - Có thể kiểm chứng
> - Trách nhiệm chung phần mềm + người dùng

### Slide 14 - Q&A

---

## 🎤 Lưu ý cho người trình bày

1. **Nói chậm + nhấn vào ẩn dụ.** Khách hàng nontech sẽ nhớ "két sắt mật mã" lâu hơn nhớ "AES-256-GCM".
2. **Dùng số liệu cụ thể.** "Hacker cần 10²² năm" thuyết phục hơn "rất khó phá".
3. **Demo trực tiếp nếu có laptop.** Cho xem trang `/settings/security` thật, xem 5-fail-lock thật.
4. **Không sa đà thuật ngữ.** Nếu khách hỏi "AES là gì?" - trả lời "Tiêu chuẩn mã hóa dùng bởi quân đội Mỹ + ngân hàng" thay vì giải thích thuật toán.
5. **Khi bị hỏi "có tuyệt đối an toàn không?"** - trả lời thật: "Không có hệ thống nào tuyệt đối 100%. Nhưng phần mềm này có **6 lớp độc lập**, hacker phải phá cả 6. Xác suất là cực thấp - thấp hơn rất nhiều so với nguy cơ rò rỉ qua **cán bộ chia sẻ mật khẩu** hoặc **email phishing**. Vì vậy đào tạo người dùng quan trọng không kém công nghệ."
6. **Nếu khách hàng hỏi chi phí bảo mật:** đây là **đầu tư 1 lần**, không tính phí phát sinh - các tính năng đều miễn phí (Argon2, AES, TLS đều là chuẩn open source).

---

> **Cuối cùng:** Khi trình bày, nhấn câu này: *"Phần mềm này không chỉ làm theo chuẩn, mà còn vượt chuẩn. Nhưng quan trọng nhất, **chúng tôi xây như đang xây két sắt của chính mình** - vì nếu lỡ rò rỉ, người chịu trách nhiệm là chúng ta, không phải hacker."*
