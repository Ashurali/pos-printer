# config/routes.rb
# Add these routes to your existing routes.rb

Rails.application.routes.draw do
  # Printer Settings
  resource :printer_settings, only: [:show, :update] do
    get :config, on: :member, defaults: { format: :json }
  end

  # Checkout / POS
  resources :checkout, only: [:new, :create] do
    member do
      get  :receipt
      post :void
    end
  end

  # Sales reporting (optional)
  resources :sales, only: [:index, :show] do
    collection do
      get :today
      get :report
    end
  end
end
