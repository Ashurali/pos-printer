# app/controllers/checkout_controller.rb
class CheckoutController < ApplicationController
  before_action :load_printer_config

  # GET /checkout
  def new
    @sale = Sale.new
    @sale.sale_items.build  # start with one empty item row
  end

  # POST /checkout
  def create
    @sale = Sale.new(sale_params)
    @sale.cashier_name = current_user_name
    @sale.user = current_user_if_available

    if @sale.save
      respond_to do |format|
        format.html { redirect_to checkout_receipt_path(@sale) }
        format.json { render json: receipt_json(@sale), status: :created }
        format.turbo_stream
      end
    else
      respond_to do |format|
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: { errors: @sale.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  # GET /checkout/:id/receipt
  def receipt
    @sale = Sale.includes(:sale_items).find(params[:id])
    @receipt_data = receipt_json(@sale)
  end

  # POST /checkout/:id/void
  def void
    @sale = Sale.find(params[:id])
    if @sale.update(status: 'voided')
      redirect_to checkout_path, notice: 'Transaksi dibatalkan.'
    else
      redirect_to checkout_receipt_path(@sale), alert: 'Gagal membatalkan transaksi.'
    end
  end

  private

  def sale_params
    params.require(:sale).permit(
      :payment_method, :discount, :tax, :paid, :customer_name, :customer_phone, :notes,
      sale_items_attributes: [:id, :name, :sku, :weight, :karat, :price_per_gram, :price, :quantity, :description, :_destroy]
    )
  end

  def load_printer_config
    setting = PrinterSetting.for_user(current_user_if_available)
    @printer_config = setting.persisted? ? setting.to_js_config : {}
  end

  def receipt_json(sale)
    store_info = {
      name:    ENV.fetch('STORE_NAME', 'TOKO EMAS SEJAHTERA'),
      address: ENV.fetch('STORE_ADDRESS', 'Jl. Pasar Baru No. 123, Jakarta'),
      phone:   ENV.fetch('STORE_PHONE', '021-5551234'),
      npwp:    ENV.fetch('STORE_NPWP', ''),
    }
    sale.to_receipt_data(store_info)
  end

  def current_user_if_available
    respond_to?(:current_user) ? current_user : nil
  end

  def current_user_name
    if respond_to?(:current_user) && current_user
      current_user.try(:name) || current_user.try(:email) || 'Admin'
    else
      'Admin'
    end
  end
end
