
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = id => document.getElementById(id);
const cfg = window.ROYAL_BITES_CONFIG || {};

let sb = null;
let products = [];
let selectedImageUrl = '';
let currentUserId = null;

function status(message, type = '') {
  const el = $('appStatus');
  if (!el) return;
  el.className = 'notice' + (type ? ' ' + type : '');
  el.textContent = message;
}

function loginMessage(message, type = 'error') {
  $('loginMessage').textContent = message;
  $('loginMessage').className = 'notice ' + type;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function price(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function available(p) {
  return p.stock_available !== false &&
    (p.stock_quantity == null || Number(p.stock_quantity) > 0);
}

function normalize(p) {
  return {
    ...p,
    stockAvailable: p.stock_available,
    stockQuantity: p.stock_quantity,
    imageUrl: p.image_url,
    updatedAt: p.updated_at
  };
}

function renderProducts() {
  const search = $('searchProducts').value.trim().toLowerCase();
  const selectedCategory = $('filterCategory').value;
  const categories = [...new Set(
    products.map(p => p.category).filter(Boolean)
  )].sort();

  $('filterCategory').innerHTML =
    '<option value="">All categories</option>' +
    categories.map(c =>
      `<option value="${esc(c)}">${esc(c)}</option>`
    ).join('');

  $('filterCategory').value =
    categories.includes(selectedCategory) ? selectedCategory : '';

  $('categorySuggestions').innerHTML = categories.map(c =>
    `<option value="${esc(c)}"></option>`
  ).join('');

  $('productStat').textContent = products.length;
  $('categoryStat').textContent = categories.length;
  $('imageStat').textContent = products.filter(p => p.imageUrl).length;

  const list = $('productsList');
  list.replaceChildren();

  const shown = products.filter(p =>
    (!selectedCategory || p.category === selectedCategory) &&
    (!search || `${p.name} ${p.category}`.toLowerCase().includes(search))
  );

  $('emptyProducts').classList.toggle('hidden', shown.length > 0);

  for (const p of shown) {
    const row = document.createElement('article');
    row.className = 'product';

    const img = document.createElement('img');
    img.src = p.imageUrl || '';
    img.alt = p.name || '';
    img.onerror = () => {
      img.style.visibility = 'hidden';
    };

    const info = document.createElement('div');
    const title = document.createElement('strong');
    const sub = document.createElement('small');

    title.textContent = p.name || '(Untitled)';
    sub.textContent =
      `${p.category || 'Uncategorised'} · ₹${price(p.price)} · ` +
      `${p.stockQuantity == null ? 'Qty not tracked' : 'Qty: ' + p.stockQuantity} · ` +
      `${available(p) ? 'Available' : 'OUT OF STOCK'}` +
      `${p.active === false ? ' · Hidden' : ''}`;

    info.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const edit = document.createElement('button');
    edit.className = 'btn secondary';
    edit.textContent = 'Edit';
    edit.onclick = () => editProduct(p);

    const stock = document.createElement('button');
    stock.className = 'btn secondary';
    stock.textContent = available(p) ? 'Mark out' : 'Mark in stock';
    stock.onclick = () => toggleStock(p);

    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.onclick = () => removeProduct(p);

    actions.append(edit, stock, del);
    row.append(img, info, actions);
    list.append(row);
  }
}

function resetForm() {
  $('productForm').reset();
  $('productId').value = '';
  selectedImageUrl = '';
  $('imagePreview').src = '';
  $('editorTitle').textContent = 'Add a product';
  $('saveProductBtn').textContent = 'Save product';
  $('productActive').checked = true;
  $('stockAvailable').checked = true;
  $('stockQuantity').value = '';
  $('productImage').value = '';
}

function editProduct(p) {
  $('productId').value = p.id;
  $('productName').value = p.name || '';
  $('productCategory').value = p.category || '';
  $('productPrice').value = p.price ?? '';
  $('productDescription').value = p.description || '';
  $('productActive').checked = p.active !== false;
  $('stockAvailable').checked = p.stockAvailable !== false;
  $('stockQuantity').value =
    p.stockQuantity == null ? '' : String(p.stockQuantity);

  selectedImageUrl = p.imageUrl || '';
  $('imagePreview').src = selectedImageUrl;
  $('productImage').value = '';

  $('editorTitle').textContent = 'Edit product';
  $('saveProductBtn').textContent = 'Save changes';
  $('editorPanel').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function loadProducts() {
  const { data, error } = await sb
    .from('products')
    .select('*')
    .order('category')
    .order('name');

  if (error) {
    throw new Error('PRODUCT LOAD: ' + error.message);
  }

  products = (data || []).map(normalize);
  renderProducts();
  status(`Connected · ${products.length} products loaded from Supabase.`, 'ok');
}

async function showUser(user) {
  if (!user) {
    currentUserId = null;
    $('loginPanel').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    return;
  }

  currentUserId = user.id;

  const { data: admin, error } = await sb
    .from('admins')
    .select('user_id,enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !admin || admin.enabled !== true) {
    await sb.auth.signOut();
    $('loginPanel').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    loginMessage(
      'This account is not approved as an admin. Check the admins table.'
    );
    return;
  }

  $('loginPanel').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('signedInAs').textContent = `Signed in as ${user.email || user.id}`;

  try {
    await loadProducts();
    await enableOrderAlerts();
  } catch (err) {
    status(err.message, 'error');
  }
}

let orderAlertChannel = null;
const notifiedOrderIds = new Set();

async function enableOrderAlerts() {
  if (!sb) return;

  // Browser notification permission
  if ("Notification" in window &&
      Notification.permission === "default") {
    await Notification.requestPermission();
  }

  // Supabase Realtime subscription
  if (orderAlertChannel) return;

  orderAlertChannel = sb
    .channel("royal-bites-order-alerts")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders"
      },
      async (payload) => {
        const order = payload.new;
        const orderId = String(order.id);

        // Prevent duplicate alerts
        if (notifiedOrderIds.has(orderId)) return;
        notifiedOrderIds.add(orderId);

        // Sound alert
        try {
          const audio = new Audio("./new-order.mp3");
          await audio.play();
        } catch (err) {
          console.log("Sound could not play:", err);
        }

        // Browser notification
        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("Royal Bites - New Order!", {
            body: `New order received: #${order.id}`
          });
        }

        // Refresh the order list if this function exists
        if (typeof loadOrders === "function") {
          await loadOrders();
        }
      }
    )
    .subscribe((status) => {
      console.log("Order alert status:", status);
    });
}


if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  loginMessage(
    'Supabase config missing. Check the Project URL and anon/publishable key in config.js.'
  );
} else {
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  sb.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return showUser(data.session?.user || null);
    })
    .catch(err => loginMessage(err.message));

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showUser(session.user).catch(err => status(err.message, 'error'));
    } else {
      currentUserId = null;
      $('loginPanel').classList.remove('hidden');
      $('dashboard').classList.add('hidden');
      $('logoutBtn').classList.add('hidden');
    }
  });
}

$('loginBtn').addEventListener('click', async () => {
  if (!sb) {
    loginMessage('Set up Supabase config.js first.');
    return;
  }

  const email = $('email').value.trim();
  const password = $('password').value;

  if (!email || !password) {
    loginMessage('Enter email and password.');
    return;
  }

  $('loginBtn').disabled = true;

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (err) {
    loginMessage(err.message);
  } finally {
    $('loginBtn').disabled = false;
  }
});

$('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('loginBtn').click();
});

$('logoutBtn').addEventListener('click', () => sb?.auth.signOut());

$('productImage').addEventListener('change', () => {
  const file = $('productImage').files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024 || !file.type.startsWith('image/')) {
    alert('Choose an image smaller than 8 MB.');
    $('productImage').value = '';
    return;
  }

  $('imagePreview').src = URL.createObjectURL(file);
});

$('productForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb || !currentUserId) {
    status('Please sign in again.', 'error');
    return;
  }

  const name = $('productName').value.trim();
  const category = $('productCategory').value.trim();
  const rawPrice = $('productPrice').value.trim();
  const numericPrice = Number(rawPrice);

  if (
    !name ||
    !category ||
    rawPrice === '' ||
    !Number.isFinite(numericPrice) ||
    numericPrice < 0
  ) {
    alert('Enter a valid name, category and price.');
    return;
  }

  const rawQty = $('stockQuantity').value.trim();

  if (
    rawQty !== '' &&
    (!Number.isInteger(Number(rawQty)) || Number(rawQty) < 0)
  ) {
    alert('Quantity must be a whole number 0 or higher.');
    return;
  }

  const btn = $('saveProductBtn');
  btn.disabled = true;

  try {
    const existingId = $('productId').value;
    const id = existingId || crypto.randomUUID();
    const file = $('productImage').files[0];
    let imageUrl = selectedImageUrl;

    if (file) {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${id}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await sb.storage
        .from('product-images')
        .upload(path, file, {
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        throw new Error('IMAGE UPLOAD: ' + uploadError.message);
      }

      const { data } = sb.storage
        .from('product-images')
        .getPublicUrl(path);

      imageUrl = data.publicUrl;
    }

    const row = {
      id,
      name,
      category,
      price: numericPrice,
      description: $('productDescription').value.trim(),
      image_url: imageUrl || null,
      active: $('productActive').checked,
      stock_available:
        $('stockAvailable').checked &&
        !(rawQty !== '' && Number(rawQty) === 0),
      stock_quantity: rawQty === '' ? null : Number(rawQty),
      updated_at: new Date().toISOString()
    };

    const { error: saveError } = await sb
      .from('products')
      .upsert(row, { onConflict: 'id' });

    if (saveError) {
      throw new Error('PRODUCT SAVE: ' + saveError.message);
    }

    status(`Saved "${name}" in Supabase.`, 'ok');
    resetForm();
    await loadProducts();
  } catch (err) {
    status(`Save failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function toggleStock(p) {
  const next = !available(p);

  if (next && p.stockQuantity != null && Number(p.stockQuantity) <= 0) {
    status(`Set quantity above 0 for ${p.name} first.`, 'error');
    return;
  }

  const { error } = await sb
    .from('products')
    .update({
      stock_available: next,
      updated_at: new Date().toISOString()
    })
    .eq('id', p.id);

  if (error) {
    status('STOCK UPDATE: ' + error.message, 'error');
  } else {
    await loadProducts();
  }
}

async function removeProduct(p) {
  if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;

  const { error } = await sb
    .from('products')
    .delete()
    .eq('id', p.id);

  if (error) {
    status('PRODUCT DELETE: ' + error.message, 'error');
    return;
  }

  status('Product deleted.', 'ok');

  if ($('productId').value === p.id) resetForm();
  await loadProducts();
}

$('addProductBtn').addEventListener('click', () => {
  resetForm();
  $('editorPanel').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});

$('resetFormBtn').addEventListener('click', resetForm);
$('searchProducts').addEventListener('input', renderProducts);
$('filterCategory').addEventListener('change', renderProducts);

$('importMenuBtn').addEventListener('click', async () => {
  if (!sb || !currentUserId) {
    status('Please sign in first.', 'error');
    return;
  }

  if (!confirm('Import starter products? New product IDs will be generated.')) {
    return;
  }

  const btn = $('importMenuBtn');
  btn.disabled = true;

  try {
    const response = await fetch('./seed-products.json');

    if (!response.ok) {
      throw new Error('seed-products.json missing');
    }

    const seed = await response.json();

    for (let i = 0; i < seed.length; i += 100) {
      const rows = seed.slice(i, i + 100).map(p => ({
        id: crypto.randomUUID(),
        name: p.name,
        category: p.category,
        price: p.price,
        description: p.description || '',
        image_url: p.imageUrl || null,
        active: p.active !== false,
        stock_available: p.stockAvailable !== false,
        stock_quantity:
          p.stockQuantity == null ? null : Number(p.stockQuantity)
      }));

      const { error } = await sb
        .from('products')
        .insert(rows);

      if (error) {
        throw new Error('PRODUCT IMPORT: ' + error.message);
      }
    }

    await loadProducts();
    status(`Imported ${seed.length} starter products.`, 'ok');
  } catch (err) {
    status('Import failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

resetForm();


let royalBitesOrderChannel = null;
const royalBitesSeenOrders = new Set();

async function enableRoyalBitesOrderAlerts() {
  if (!sb || royalBitesOrderChannel) return;

  royalBitesOrderChannel = sb
    .channel("royal-bites-admin-orders")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders"
      },
      async (payload) => {
        const order = payload.new;
        const id = String(order.id);

        if (royalBitesSeenOrders.has(id)) return;
        royalBitesSeenOrders.add(id);

        // Play new-order sound
        try {
          const audio = new Audio("./new-order.mp3");
          await audio.play();
        } catch (err) {
          console.warn("Sound unavailable:", err);
        }

        // Show browser notification
        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("Royal Bites - New Order!", {
            body: `Order #${order.order_number ?? order.id} received`
          });
        }

        console.log("New Royal Bites order:", order);
      }
    )
    .subscribe((status) => {
      console.log("Order notification status:", status);
    });
}
// Clean Realtime Order Listener for admin.js
if (typeof sb !== 'undefined' && sb) {
  const orderSound = new Audio('sounds/notification.mp3');
  let orderCount = 0;

  // Unlock audio on click anywhere on page
  document.body.addEventListener('click', () => {
    orderSound.play().then(() => {
      orderSound.pause();
      orderSound.currentTime = 0;
    }).catch(() => {});
  }, { once: true });

  sb.channel('public:orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      const newOrder = payload.new;
      console.log('Notun order aseche:', newOrder);

      // Render order card in admin container
      const container = document.getElementById('order-container');
      if (container) {
        const card = document.createElement('div');
        card.style.cssText = "background: #fff; padding: 15px; margin-bottom: 10px; border-left: 5px solid #e74c3c; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);";
        card.innerHTML = `
       <strong style="color: #e74c3c;">NEW ORDER #${newOrder.id || newOrder.orderId}</strong><br>
          Name: ${newOrder.customer_name || newOrder.name || 'N/A'}<br>
          Phone: ${newOrder.phone || 'N/A'}<br>
          Address: ${newOrder.address || 'N/A'}<br>
         Order Type: <span style="font-weight: bold; color: #2563eb;">${
  String(newOrder.order_type ?? newOrder.orderType ?? "Not specified")
    .trim()
    .toLowerCase() === "takeaway"
      ? "Takeaway"
      : String(newOrder.order_type ?? newOrder.orderType ?? "")
          .trim()
          .toLowerCase() === "delivery"
        ? "Delivery"
        : (newOrder.order_type ?? newOrder.orderType ?? "Not specified")
}</span><br>
          Total: ₹${newOrder.total_amount || newOrder.total || 0}
        `;
        console.log("ORDER TYPE CHECK:", newOrder.order_type, newOrder);
       
        container.prepend(card);
      }

      // Counter update (jodi unread-count id thake)
      orderCount++;
      const counter = document.getElementById('unread-count');
      if (counter) {
        counter.innerText = orderCount;
      }

      // Play notification sound
      orderSound.currentTime = 0;
      orderSound.play().catch(() => {});
    })
    .subscribe();
}
// ==================== CLEAN REALTIME ORDERS & RUPEE SYMBOL ====================

function connectRealtimeOrders() {
  if (typeof sb === 'undefined' || !sb) {
    setTimeout(connectRealtimeOrders, 300);
    return;
  }

  const audioAlert = new Audio('sounds/notification.mp3');
  let liveUnreadCount = 0;

  // Sound enable on click
  document.body.addEventListener('click', () => {
    audioAlert.play().then(() => {
      audioAlert.pause();
      audioAlert.currentTime = 0;
    }).catch(() => {});
  }, { once: true });

  // Purono duplicate channel remove korar jonno
  sb.removeAllChannels();

  // New Realtime Channel
  sb.channel('admin-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        const newOrder = payload.new;
        console.log('🔥 REALTIME ORDER RECEIVED:', newOrder);

        const noOrderMsg = document.getElementById('no-orders-msg');
        if (noOrderMsg) noOrderMsg.style.display = 'none';

        const orderContainer = document.getElementById('order-container');
        if (orderContainer) {
          const card = document.createElement('div');
          card.style.cssText = "background: #fff; padding: 15px; margin-bottom: 12px; border-left: 5px solid #27ae60; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);";
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0; color:#2c3e50;">NEW ORDER #${newOrder.id}</h4>
              <span style="background:#27ae60; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px;">JUST NOW</span>
            </div>
            <p style="margin:5px 0 2px;"><strong>Customer:</strong> ${newOrder.customer_name || newOrder.name || 'N/A'}</p>
            <p style="margin:2px 0;"><strong>Phone:</strong> ${newOrder.phone || 'N/A'}</p>
            <p style="margin:2px 0;"><strong>Address:</strong> ${newOrder.address || 'N/A'}</p>
            <p style="margin:2px 0;"><strong>Order Type:</strong> ${newOrder.order_type || newOrder.orderType || 'Not specified'}</p>
            <p style="margin:4px 0 0; color:#e74c3c;"><strong>Total: ₹${newOrder.total_amount || newOrder.total || 0}</strong></p>
          `;
          
          orderContainer.prepend(card);
        }

        // Update Counter
        liveUnreadCount++;
        const counterEl = document.getElementById('unread-count');
        if (counterEl) counterEl.innerText = liveUnreadCount;

        // Play Sound
        audioAlert.currentTime = 0;
        audioAlert.play().catch(() => {});
      }
    )
    .subscribe();
}

connectRealtimeOrders();
// ==================== ADMIN REALTIME WITH UNIQUE UPI CASH CHIME SOUND ====================

document.addEventListener('DOMContentLoaded', () => {
  if (typeof sb === 'undefined' || !sb) return;

  let liveUnreadCount = 0;
  let isAudioEnabled = false;

  // Create Safe Positioned Audio Status Badge (Bottom-Right Corner)
  const audioBanner = document.createElement('div');
  audioBanner.id = 'audio-enable-banner';
  audioBanner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 99999;
    background: #e74c3c;
    color: white;
    padding: 10px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: sans-serif;
  `;
  audioBanner.innerHTML = `🔊 Click to Enable Sound Alert`;
  document.body.appendChild(audioBanner);

  // Unique Paytm / PhonePe Style UPI Cash Chime Sound Generator
  function playCashChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();

      // Ascending cash chime notes (UPI payment success style)
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle'; // Richer sound tone
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + (index * 0.08));

        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + (index * 0.08));
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (index * 0.08) + 0.3);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime + (index * 0.08));
        osc.stop(audioCtx.currentTime + (index * 0.08) + 0.3);
      });
      console.log('💰 UPI Cash Chime Played!');
    } catch (err) {
      console.log('Audio Error:', err);
    }
  }

  function enableAudioOnUserAction() {
    isAudioEnabled = true;
    playCashChime();
    audioBanner.style.background = '#27ae60';
    audioBanner.innerHTML = `🔔 Sound Active`;
    setTimeout(() => {
      audioBanner.style.opacity = '0.7';
    }, 3000);
  }

  audioBanner.addEventListener('click', enableAudioOnUserAction, { once: true });
  document.body.addEventListener('click', () => {
    if (!isAudioEnabled) enableAudioOnUserAction();
  }, { once: true });

  // Request Notification Permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Fetch Product Image dynamically from 'products' table
  async function getProductImageUrl(itemName) {
    if (!itemName) return '';
    try {
      const { data } = await sb
        .from('products')
        .select('*')
        .ilike('name', `%${itemName.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (data) {
        return data.image_url || data.image || data.img_url || data.img || data.photo || data.picture || '';
      }
    } catch (err) {
      console.log('Error fetching product image:', err);
    }
    return '';
  }

  sb.removeAllChannels();

  // Supabase Realtime Listener
  sb.channel('admin-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      async (payload) => {
        const newOrder = payload.new;
        console.log('🔥 REALTIME ORDER RECEIVED:', newOrder);

        const noOrderMsg = document.getElementById('no-orders-msg');
        if (noOrderMsg) noOrderMsg.style.display = 'none';

        const orderDateObj = newOrder.created_at ? new Date(newOrder.created_at) : new Date();
        const dd = String(orderDateObj.getDate()).padStart(2, '0');
        const mm = String(orderDateObj.getMonth() + 1).padStart(2, '0');
        const yy = String(orderDateObj.getFullYear()).slice(-2);
        const formattedDate = `${dd}/${mm}/${yy}`;
        const formattedTime = orderDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateTimeString = `${formattedDate} - ${formattedTime}`;

        let itemsHtml = '';
        const rawItems = newOrder.items || newOrder.cart || newOrder.order_items;

        if (rawItems) {
          try {
            const parsedItems = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
            if (Array.isArray(parsedItems) && parsedItems.length > 0) {
              let itemsListHtml = '';
              for (const item of parsedItems) {
                const itemName = item.name || 'Product';
                const itemQty = item.quantity || item.qty || 1;
                const itemPrice = item.price ? `₹${item.price}` : '';

                let imgUrl = item.image || item.image_url || await getProductImageUrl(itemName);

                itemsListHtml += `<li style="display: flex; align-items: center; margin-bottom: 8px; background: #fff; padding: 6px; border-radius: 4px; border: 1px solid #eee;">`;

                if (imgUrl) {
                  itemsListHtml += `<img src="${imgUrl}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; margin-right: 10px; border: 1px solid #ddd;" />`;
                } else {
                  itemsListHtml += `<div style="width: 45px; height: 45px; background: #eee; border-radius: 4px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #777;">No Image</div>`;
                }

                itemsListHtml += `<div>
                  <div style="font-weight: bold; color: #333;">${itemName} (x${itemQty})</div>
                  <div style="font-size: 11px; color: #666;">${itemPrice}</div>
                </div></li>`;
              }

              itemsHtml = `<div style="margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px; font-size: 13px;">
                <strong>Items Ordered:</strong>
                <ul style="margin: 5px 0 0 0; padding: 0; list-style: none;">${itemsListHtml}</ul>
              </div>`;
            }
          } catch (e) {
            itemsHtml = `<p style="margin: 4px 0; font-size: 13px; color: #555;"><strong>Items:</strong> ${rawItems}</p>`;
          }
        }

        let orderContainer = document.getElementById('order-container');
        if (!orderContainer) {
          orderContainer = document.createElement('div');
          orderContainer.id = 'order-container';
          document.body.prepend(orderContainer);
        }

        const card = document.createElement('div');
        card.style.cssText = "background: #fff; padding: 15px; margin-bottom: 12px; border-left: 5px solid #27ae60; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); font-family: sans-serif;";

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; color:#2c3e50;">NEW ORDER #${newOrder.id ? newOrder.id.slice(0,8) : 'N/A'}</h4>
            <span style="background:#27ae60; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px;">📅 ${dateTimeString}</span>
          </div>
          <p style="margin:5px 0 2px;"><strong>Customer:</strong> ${newOrder.customer_name || newOrder.name || 'N/A'}</p>
          <p style="margin:2px 0;"><strong>Phone:</strong> ${newOrder.phone || 'N/A'}</p>
          <p style="margin:2px 0;"><strong>Address:</strong> ${newOrder.address || 'N/A'}</p>
          <p style="margin:2px 0;"><strong>Order Type:</strong> ${newOrder.order_type || newOrder.orderType || 'Not specified'}</p>
          ${itemsHtml}
          <p style="margin:6px 0 0; color:#e74c3c; font-size: 15px;"><strong>Total: ₹${newOrder.total_amount || newOrder.total || 0}</strong></p>
        `;

        orderContainer.prepend(card);

        liveUnreadCount++;
        const counterEl = document.getElementById('unread-count');
        if (counterEl) counterEl.innerText = liveUnreadCount;

        // Play Unique UPI Cash Chime Sound immediately
        playCashChime();

        // Browser Desktop Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🛒 New Order Received!', {
            body: `Order #${newOrder.id ? newOrder.id.slice(0,8) : ''} - Total: ₹${newOrder.total_amount || newOrder.total || 0}`,
          });
        }
      }
    )
    .subscribe();
});