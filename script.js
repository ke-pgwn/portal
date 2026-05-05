// ===============================
// GLOBAL
// ===============================
let bagian = "";
window.dataPegawai = [];
const API_URL =
  "https://script.google.com/macros/s/AKfycbwQQBnyw7WMsx5IGWrWhozu5tTpXq7esFHkRVm2H6V1Sa5Y9RDsiDOu669roHMyoNmK/exec";

// ===============================
// PILIH BAGIAN
// ===============================
async function pilihBagian(b) {
  bagian = b;

  document.getElementById("menu").classList.add("hidden");
  document.getElementById("formAbsen").classList.remove("hidden");

  // 🔥 mapping nama tampilan
  let label = b;

  if (b === "PK") label = "Program Keuangan";
  if (b === "UMUM") label = "Umum";
  if (b === "PUU") label = "PUU";
  if (b === "FASGARWAS") label = "Fasgarwas";

  document.getElementById("judul").innerText = "Absen " + label;

  // 🔥 HEADER COLOR
  const header = document.getElementById("headerTitle");

  if (b === "FASGARWAS") header.style.background = "orange";
  if (b === "UMUM") header.style.background = "blue";
  if (b === "PUU") header.style.background = "red";
  if (b === "PK") header.style.background = "green";

  header.style.color = "white";

  // ===============================
  // 🔥 TAMBAHAN: RESET FORM
  // ===============================
  document.getElementById("nama").value = "";
  document.getElementById("nip").value = "";
  document.getElementById("jabatanText").value = "";
  document.getElementById("foto").value = "";

  // reset preview foto (kalau ada)
  const preview = document.getElementById("previewBox");
  if (preview) {
    preview.innerHTML = `
      📷
      <p>Ambil Foto</p>
    `;
  }

  // ===============================
  // LOAD DATA
  // ===============================
  await loadData();
}

// ===============================
// LOAD DATA
// ===============================
async function loadData() {
  try {
    const snapshot = await get(ref(window.db, "employees"));

    if (!snapshot.exists()) return;

    const data = snapshot.val();

    const datalist = document.getElementById("listNama");
    datalist.innerHTML = "";

    window.dataPegawai = [];

    Object.keys(data).forEach((key) => {
      const item = data[key];

      // filter sesuai bagian
      if (item.bagian !== bagian) return;

      const option = document.createElement("option");
      option.value = item.nama;

      datalist.appendChild(option);

      window.dataPegawai.push(item);
    });
  } catch (err) {
    console.error("Gagal load Firebase:", err);
  }
}

// ===============================
// AUTO ISI NIP dan JABATAN
// ===============================
document.getElementById("nama").addEventListener("input", function () {
  const value = this.value.toLowerCase();

  const found = window.dataPegawai.find(
    (item) => item.nama.toLowerCase() === value,
  );

  document.getElementById("nip").value = found ? found.nip : "";

  // 🔥 TAMBAHAN INI
  document.getElementById("jabatanText").value = found ? found.jabatan : "";
});

// ===============================
// CONVERT FOTO
// ===============================
function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

// ===============================
// RETRY
// ===============================
async function uploadWithRetry(data, retry = 3) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error("Upload gagal");

    return await res.json();
  } catch (err) {
    if (retry > 0) {
      console.log("Retry...", retry);

      // delay sebelum retry
      await new Promise((r) => setTimeout(r, 1000));

      return uploadWithRetry(data, retry - 1);
    } else {
      throw err;
    }
  }
}

// ===============================
// SUBMIT ABSEN
// ===============================
async function submitAbsen() {
  // 🔒 VALIDASI HARI & JAM (WIB)
  const now = new Date();

  const jakartaTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );

  const day = jakartaTime.getDay(); // 1 = Senin
  const hour = jakartaTime.getHours();

  // hanya Senin
  if (day !== 1) {
    alert("Absen hanya bisa dilakukan hari Senin");
    return;
  }

  // hanya jam 07:00 - 08:00
  if (hour < 7 || hour >= 8) {
    alert("Absen hanya bisa pukul 07:00 - 08:00 WIB");
    return;
  }

  const btn = document.querySelector("#formAbsen .btn-submit");
  if (btn.disabled) return;

  const file = document.getElementById("foto").files[0];
  const nama = document.getElementById("nama").value.trim();
  const nip = document.getElementById("nip").value;

  const selectedUser = window.dataPegawai.find(
    (item) => item.nama.toLowerCase() === nama.toLowerCase(),
  );

  if (!selectedUser) {
    alert("Pilih nama dari daftar!");
    resetBtn(btn);
    return;
  }

  if (!file) {
    alert("Foto wajib diambil!");
    resetBtn(btn);
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("File harus berupa gambar");
    resetBtn(btn);
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Ukuran foto maksimal 5MB");
    resetBtn(btn);
    return;
  }

  // 🔥 CEK SUDAH ABSEN ATAU BELUM
  const snapshot = await get(ref(window.db, "attendance"));
  const data = snapshot.val();

  const today = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  let sudahAbsen = false;

  if (data) {
    for (let key in data) {
      const item = data[key];

      if (
        item.nama.toLowerCase() === nama.toLowerCase() &&
        item.waktu === today
      ) {
        sudahAbsen = true;
        break;
      }
    }
  }

  if (sudahAbsen) {
    alert("Nama ini sudah melakukan absen hari ini ❌");
    resetBtn(btn);
    return;
  }

  btn.innerText = "Uploading...";
  btn.disabled = true;

  try {
    // 🔥 compress
    const compressedFile = await compressImage(file);

    // 🔥 convert base64
    const base64 = await getBase64(compressedFile);

    // 🔥 kirim ke Apps Script (Drive)
    let now = new Date();
    const tanggal = now.toISOString().split("T")[0];

    const safeNama = nama.replace(/\s+/g, "_");
    const safeBagian = bagian.replace(/\s+/g, "_");

    const fileName = `${safeNama}-${safeBagian}-${tanggal}.jpg`;

    // 🔥 delay biar gak tabrakan
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000));

    const result = await uploadWithRetry({
      image: base64,
      fileName: fileName,
    });

    if (!result || !result.url) {
      throw new Error("Upload gagal (no URL)");
    }

    const imageUrl = result.url;

    btn.innerText = "Mengirim data...";

    // 🔥 simpan ke Firebase (ambil jabatan dari database)
    // 🔥 bikin waktu dulu
    const waktu = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // 🔥 baru simpan ke Firebase
    await push(ref(window.db, "attendance"), {
      nama,
      nip: nip || "-",
      jabatan: selectedUser.jabatan,
      bagian,
      image: imageUrl,
      waktu: waktu, // ✅ masukkan di sini
    });

    btn.innerText = "Berhasil!";

    alert("✅ Absen berhasil!\nTerima kasih 🙏");

    location.reload();
  } catch (err) {
    console.error(err);
    alert(err.message || "Gagal upload");
    resetBtn(btn);
  }
}

// ===============================
// RESET BUTTON
// ===============================
function resetBtn(btn) {
  btn.innerText = "Submit";
  btn.disabled = false;
}

// ===============================
// FORM PEGAWAI BARU
// ===============================
function pegawaiBaru() {
  document.getElementById("formAbsen").classList.add("hidden");
  document.getElementById("formBaru").classList.remove("hidden");
}

async function submitBaru() {
  const btn = document.querySelector("#formBaru .btn-submit");

  btn.innerText = "Loading...";
  btn.disabled = true;

  const nama = document.getElementById("namaBaru").value.trim();
  const nip = document.getElementById("nipBaru").value.trim();
  const jabatanEl = document.querySelector('input[name="jabatanBaru"]:checked');

  if (!nama) {
    alert("Isi nama terlebih dahulu");
    resetBtn(btn);
    return;
  }

  if (!jabatanEl) {
    alert("Pilih jabatan dulu");
    resetBtn(btn);
    return;
  }

  try {
    await push(ref(window.db, "new_users"), {
      nama,
      nip: nip || "-",
      jabatan: jabatanEl.value,
      bagian: bagian,
      waktu: new Date().toLocaleDateString("id-ID"),
    });

    alert("Tersimpan!");
    location.reload();
  } catch (err) {
    alert("Gagal simpan data");
    resetBtn(btn);
  }
}

// ===============================
// NAVIGASI
// ===============================
function kembaliMenu() {
  document.getElementById("menu").classList.remove("hidden");
  document.getElementById("formAbsen").classList.add("hidden");

  // 🔥 reset warna
  const header = document.getElementById("headerTitle");
  header.style.background = "";
  header.style.color = "";
}

function kembaliKeAbsen() {
  document.getElementById("formBaru").classList.add("hidden");
  document.getElementById("formAbsen").classList.remove("hidden");
}

// ===============================
// PREVIEW FOTO
// ===============================
document.getElementById("foto").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    document.getElementById("previewBox").innerHTML =
      `<img src="${e.target.result}" style="width:100%; border-radius:15px;">`;
  };

  reader.readAsDataURL(file);
});

// ===============================
// KOMPRESS FOTO
// ===============================
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");

      let width = img.width;
      let height = img.height;

      // resize proporsional
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
